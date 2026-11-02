/**
 * Time ranges are validated by exactly one rule.
 *
 * Regression tests for the audit finding "Contradictory and duplicate
 * diagnostics: Langium start<=end rule vs Typir end>start rule, plus
 * double-reported errors". The Langium checkValidTimeRange rule accepted
 * zero-length ranges that the Typir rule rejected, every inverted range was
 * reported twice, and a partial range (`at 0s.. [`) got a false
 * "end time (0s) must be greater than start time (0s)" error.
 *
 * The single definition now: a timed event must have end > start, so a
 * zero-length range is an error, reported once.
 */
import { beforeAll, describe, expect, test } from 'vitest';
import { createTestContext, DiagnosticSeverity, type TestContext } from './test-helpers.js';

const TIME_RANGE_MESSAGE = /start time|end time/i;

describe('Timeline event time ranges use a single rule', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  async function validate(timelineBody: string) {
    const document = await ctx.parse(`
      action a() [ log("x") ]
      timeline "t" in "#app" using raf {
        ${timelineBody}
      }
    `);
    await ctx.services.shared.workspace.DocumentBuilder.build([document], { validation: true });
    const timeDiagnostics = (document.diagnostics ?? []).filter(d =>
      TIME_RANGE_MESSAGE.test(d.message)
    );
    return { document, timeDiagnostics };
  }

  test('an inverted range yields exactly one diagnostic', async () => {
    const { document, timeDiagnostics } = await validate('at 2s..1s a()');
    expect(document.parseResult.parserErrors).toEqual([]);
    expect(timeDiagnostics).toHaveLength(1);
    expect(timeDiagnostics[0].severity).toBe(DiagnosticSeverity.Error);
    expect(timeDiagnostics[0].message).toMatch(/end time \(1s\) must be greater than start time/);
    expect(timeDiagnostics[0].message).not.toMatch(/less than or equal/);
  });

  test('a zero-length range is rejected, once (end must be after start)', async () => {
    const { document, timeDiagnostics } = await validate('at 5s..5s a()');
    expect(document.parseResult.parserErrors).toEqual([]);
    expect(timeDiagnostics).toHaveLength(1);
    expect(timeDiagnostics[0].severity).toBe(DiagnosticSeverity.Error);
  });

  test('a zero-length range in mixed units is rejected too', async () => {
    const { timeDiagnostics } = await validate('at 1s..1000ms a()');
    expect(timeDiagnostics).toHaveLength(1);
  });

  test('a valid mixed-unit range yields no diagnostic', async () => {
    const { document, timeDiagnostics } = await validate('at 500ms..2s a()');
    expect(document.parseResult.parserErrors).toEqual([]);
    expect(timeDiagnostics).toEqual([]);
  });

  test('a partial range (missing end) gets only the syntax error, no time-range error', async () => {
    const { document, timeDiagnostics } = await validate('at 0s.. [ log("x") ] [ ]');
    expect(document.parseResult.parserErrors.length).toBeGreaterThan(0);
    expect(timeDiagnostics).toEqual([]);
  });
});
