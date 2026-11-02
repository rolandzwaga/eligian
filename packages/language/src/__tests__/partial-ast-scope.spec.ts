/**
 * A name that does not parse (`action loop()`: `loop` is a keyword, `const = 5`)
 * leaves a node without a name in the AST. The scope provider used to offer it
 * as a callable action or a variable anyway, which made Langium's linker throw
 * ("Node … has no name") for every reference in the file. Now only the syntax
 * error is reported.
 */
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { createTestContext, DiagnosticSeverity, type TestContext } from './test-helpers.js';

describe('scopes of a partially parsed document', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('nameless actions and constants are left out of the scopes', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { document, diagnostics } =
      await ctx.parseAndValidate(`action loop(selector) [ selectElement(selector) ]
action ok() [ selectElement("#a") ]
const = 5
timeline "t" in "#s" using raf { at 0s..1s ok() at 1s..2s [ log(@x) ] [] }`);
    expect(consoleError).not.toHaveBeenCalled();
    expect(document.parseResult.parserErrors).toHaveLength(2);
    // The calls of the parsed action still resolve
    const unresolved = diagnostics.filter(
      d => d.severity === DiagnosticSeverity.Error && d.message.includes("named 'ok'")
    );
    expect(unresolved).toEqual([]);
  });
});
