/**
 * Feature 048: `at <start> for <duration>` and optional end blocks.
 *
 * `at 2s for 3s` is `at 2s..5s`; with a relative start (`at +0s for 3s`) the
 * event follows the previous one. The end block of inline timeline blocks and
 * inline stagger blocks may be left out.
 */
import { Effect } from 'effect';
import { beforeAll, describe, expect, test } from 'vitest';
import type { CodeAction } from 'vscode-languageserver-protocol';
import {
  createTestContext,
  DiagnosticSeverity,
  type TestContext,
} from '../../__tests__/test-helpers.js';
import { transformAST } from '../../compiler/ast-transformer.js';
import { RELATIVE_DURATION_MESSAGE } from '../../utils/time-units.js';

describe('at <start> for <duration> (Feature 048)', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  const program = (events: string) => `timeline "t" in ".c" using raf {\n${events}\n}`;

  async function compiled(events: string) {
    const { program: ast, document } = await ctx.parseAndValidate(program(events));
    expect(document.parseResult.parserErrors).toHaveLength(0);
    return Effect.runPromise(transformAST(ast));
  }

  async function timesOf(events: string) {
    const { config } = await compiled(events);
    return config.timelines[0].timelineActions.map(a => [a.duration.start, a.duration.end]);
  }

  async function errorsOf(events: string) {
    const { diagnostics, program: ast } = await ctx.parseAndValidate(program(events));
    const errors = diagnostics.filter(d => d.severity === DiagnosticSeverity.Error);
    const result = await Effect.runPromise(Effect.result(transformAST(ast)));
    return { errors: errors.map(e => e.message), result };
  }

  describe('compiled times', () => {
    test('a duration is added to the start, in any unit', async () => {
      expect(
        await timesOf(`
          at 2s for 3s [ selectElement("#a") ]
          at 500ms for 2s [ selectElement("#a") ]
          at 1m for 90s [ selectElement("#a") ]
        `)
      ).toEqual([
        [2, 5],
        [0.5, 2.5],
        [60, 150],
      ]);
    });

    test('a relative start follows the previous event, including one written with for', async () => {
      expect(
        await timesOf(`
          at 0s..1s [ selectElement("#a") ]
          at +0s for 2s [ selectElement("#a") ]
          at +1s for 0.5s [ selectElement("#a") ]
        `)
      ).toEqual([
        [0, 1],
        [1, 3],
        [4, 4.5],
      ]);
    });

    test('a timed for loop still works after both range forms', async () => {
      expect(
        await timesOf(`
          at 0s..1s for (item in [1, 2]) { selectElement("#a") }
          at 1s for 1s for (item in [1, 2]) { selectElement("#a") }
        `)
      ).toEqual([
        [0, 1],
        [1, 2],
      ]);
    });
  });

  describe('optional end blocks', () => {
    test('an inline block without an end block has no end operations', async () => {
      const { config } = await compiled('at 0s..2s [ selectElement("#a") addClass("on") ]');
      const [action] = config.timelines[0].timelineActions;
      expect(action.startOperations.map(o => o.systemName)).toEqual(['selectElement', 'addClass']);
      expect(action.endOperations).toEqual([]);
    });

    test('an inline stagger block without an end block has no end operations', async () => {
      const { config } = await compiled('stagger 1s [1, 2] for 2s [ selectElement("#a") ]');
      const actions = config.timelines[0].timelineActions;
      expect(actions).toHaveLength(2);
      expect(actions.every(a => a.endOperations.length === 0)).toBe(true);
    });

    test('an explicit end block still works', async () => {
      const { config } = await compiled(
        'at 0s for 1s [ selectElement("#a") addClass("on") ] [ selectElement("#a") removeClass("on") ]'
      );
      expect(config.timelines[0].timelineActions[0].endOperations.map(o => o.systemName)).toEqual([
        'selectElement',
        'removeClass',
      ]);
    });
  });

  describe('validation (editor and compiler agree)', () => {
    test('a zero or negative duration is an error', async () => {
      const { errors } = await errorsOf('at 2s for 0s [ selectElement("#a") ]');
      // Typir prefixes its problems with the validated node
      expect(
        errors.some(e => e.endsWith('Timeline event duration must be greater than 0 (got 0s)'))
      ).toBe(true);
    });

    test('a relative duration is an error in the editor and the compiler', async () => {
      const { errors, result } = await errorsOf('at 2s for +1s [ selectElement("#a") ]');
      expect(errors.some(e => e.endsWith(RELATIVE_DURATION_MESSAGE))).toBe(true);
      expect(result._tag).toBe('Failure');
      if (result._tag === 'Failure') expect(result.failure.message).toBe(RELATIVE_DURATION_MESSAGE);
    });

    test('a property chain as duration is reported like other time slots', async () => {
      const { errors } = await errorsOf('at 0s for $globaldata.len [ selectElement("#a") ]');
      expect(
        errors.some(e => e.startsWith('Property references are not supported in time expressions'))
      ).toBe(true);
    });
  });

  describe("code action: convert 'a..b' to 'a for <length>'", () => {
    async function convert(range: string) {
      const code = program(`at ${range} [ selectElement("#a") ]`);
      const document = await ctx.parse(code);
      await ctx.services.shared.workspace.DocumentBuilder.build([document], { validation: false });
      const offset = code.indexOf(range) + 1;
      const position = document.textDocument.positionAt(offset);
      const actions = (await ctx.services.Eligian.lsp.CodeActionProvider!.getCodeActions(document, {
        range: { start: position, end: position },
        context: { diagnostics: [] },
        textDocument: { uri: document.uri.toString() },
      })) as CodeAction[];
      const action = actions.find(a => a.title.startsWith('Convert to'));
      if (!action) return undefined;
      const [edit] = action.edit!.changes![document.uri.toString()];
      const start = document.textDocument.offsetAt(edit.range.start);
      const end = document.textDocument.offsetAt(edit.range.end);
      return { title: action.title, result: code.slice(0, start) + edit.newText + code.slice(end) };
    }

    test.each([
      ['2s..5s', "Convert to '2s for 3s'", 'at 2s for 3s ['],
      ['2m..5m', "Convert to '2m for 3m'", 'at 2m for 3m ['],
      ['0s..1500ms', "Convert to '0s for 1.5s'", 'at 0s for 1.5s ['],
      ['+0s..+5s', "Convert to '+0s for 5s'", 'at +0s for 5s ['],
    ])('%s', async (range, title, expected) => {
      const converted = await convert(range);
      expect(converted?.title).toBe(title);
      expect(converted?.result).toContain(expected);
    });

    test.each([['2s for 3s'], ['0s..$globaldata.end'], ['5s..2s']])(
      'is not offered for %s',
      async range => {
        expect(await convert(range)).toBeUndefined();
      }
    );
  });
});
