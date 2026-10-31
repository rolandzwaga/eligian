/**
 * setData target keys.
 *
 * Eligius's setData reads each key's target as its first segment minus the first
 * character, so `"operationdata.name"` throws "Unrecognized target: perationdata"
 * at runtime. Keys must be `$operationdata.<path>`, `$globaldata.<path>` or
 * `$scope.<path>`; a missing `$` has a quick fix.
 */
import { beforeAll, describe, expect, test } from 'vitest';
import type { CodeAction } from 'vscode-languageserver-protocol';
import {
  createTestContext,
  DiagnosticSeverity,
  type TestContext,
} from '../../__tests__/test-helpers.js';
import {
  INVALID_SET_DATA_TARGET_CODE,
  type InvalidSetDataTargetData,
} from '../operation-call/set-data-validator.js';

describe('setData target keys', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  const program = (properties: string) => `on event "language-change" action a() [
  setData(${properties})
]
timeline "t" in ".c" using raf {}`;

  async function check(properties: string) {
    const code = program(properties);
    const { diagnostics, document } = await ctx.parseAndValidate(code);
    expect(document.parseResult.parserErrors).toHaveLength(0);
    const errors = diagnostics.filter(
      d =>
        d.severity === DiagnosticSeverity.Error &&
        (d.data as InvalidSetDataTargetData | undefined)?.code === INVALID_SET_DATA_TARGET_CODE
    );
    return { errors, document, code };
  }

  test.each([
    '{ "$operationdata.name": "x" }',
    '{ "$globaldata.count": 1 }',
    '{ "$scope.variables.total": 2 }',
    '{ "$OperationData.name": "x" }',
  ])('accepts %s', async properties => {
    const { errors } = await check(properties);
    expect(errors).toEqual([]);
  });

  test('reports a key missing its $ prefix, on the key, with the fixed key', async () => {
    const { errors, document } = await check('{ "operationdata.name": "x", "$globaldata.ok": 1 }');

    expect(errors).toHaveLength(1);
    expect(document.textDocument.getText(errors[0].range)).toBe('"operationdata.name"');
    expect(errors[0].message).toBe(
      "setData target 'operationdata.name' needs a '$' prefix: '$operationdata.name'. Eligius rejects 'operationdata.name' at runtime"
    );
    expect((errors[0].data as InvalidSetDataTargetData).fixedKey).toBe('$operationdata.name');
  });

  test.each([
    ['an unknown target', '{ "$window.x": 1 }'],
    ['a bare name', '{ "i": 1 }'],
    ['a target without a path', '{ "$operationdata": 1 }'],
  ])('reports %s without a quick fix', async (_name, properties) => {
    const { errors } = await check(properties);

    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('is not recognised');
    expect((errors[0].data as InvalidSetDataTargetData).fixedKey).toBeUndefined();
  });

  test('the quick fix inserts the missing $', async () => {
    const { errors, document, code } = await check('{ "globaldata.count": 1 }');

    const actions = (await ctx.services.Eligian.lsp.CodeActionProvider!.getCodeActions(document, {
      range: errors[0].range,
      context: { diagnostics: errors },
      textDocument: { uri: document.uri.toString() },
    })) as CodeAction[];
    const fix = actions.find(a => a.title === "Use '$globaldata.count'");
    expect(fix?.isPreferred).toBe(true);

    const [edit] = fix!.edit!.changes![document.uri.toString()];
    const offset = document.textDocument.offsetAt(edit.range.start);
    const fixed = code.slice(0, offset) + edit.newText + code.slice(offset);
    expect(fixed).toContain('setData({ "$globaldata.count": 1 })');
  });
});
