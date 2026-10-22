/**
 * Regression tests for unit-aware timeline time validation.
 *
 * Audit findings:
 * - "checkValidTimeRange compares raw time values and ignores units, rejecting
 *   valid ranges like 500ms..2s or 90s..2m"
 * - "extractTimeValue ignores m/h units, relative times and property-chain
 *   times, giving spurious and missed time-range errors"
 *
 * Time ranges are validated by exactly one rule (the Typir TimedEvent rule in
 * type-system-typir/validation/event-validation.ts), so an invalid range must
 * yield exactly one diagnostic.
 */
import { beforeAll, describe, expect, test } from 'vitest';
import { createTestContext, DiagnosticSeverity, type TestContext } from './test-helpers.js';

const TIME_MESSAGE = /start time|end time|duration|delay/i;

describe('Timeline time validation is unit-aware', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  async function timeErrors(timelineBody: string): Promise<string[]> {
    const code = `
      const items = ["a", "b"]
      timeline "Test" in "#app" using raf {
        ${timelineBody}
      }
    `;
    const document = await ctx.parse(code);
    await ctx.services.shared.workspace.DocumentBuilder.build([document], { validation: true });
    expect(document.parseResult.parserErrors).toEqual([]);
    return (document.diagnostics ?? [])
      .filter(d => d.severity === DiagnosticSeverity.Error && TIME_MESSAGE.test(d.message))
      .map(d => d.message);
  }

  const timed = (range: string) => `at ${range} [ selectElement("#box") ] [ ]`;

  test.each(['500ms..2s', '90s..2m', '30s..1m', '59m..1h', '1m..1.5h', '0s..1m + 500ms'])(
    'accepts valid mixed-unit range %s',
    async range => {
      expect(await timeErrors(timed(range))).toEqual([]);
    }
  );

  test.each(['1s..500ms', '2m..90s', '61m..1h', '5s..2s'])(
    'rejects inverted range %s with exactly one diagnostic',
    async range => {
      const errors = await timeErrors(timed(range));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/end time .* must be greater than start time/);
    }
  );

  test('reports seconds-converted values in the message', async () => {
    const [message] = await timeErrors(timed('2m..90s'));
    expect(message).toContain('90s');
    expect(message).toContain('120s');
  });

  test('accepts relative ranges like +0s..+5s', async () => {
    expect(await timeErrors(`${timed('0s..2s')} ${timed('+0s..+5s')}`)).toEqual([]);
  });

  test('rejects an inverted relative range +5s..+2s', async () => {
    const errors = await timeErrors(`${timed('0s..2s')} ${timed('+5s..+2s')}`);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/end time .* must be greater than start time/);
  });

  test('does not flag a range whose end is a property chain', async () => {
    expect(await timeErrors(timed('0s..$globaldata.endTime'))).toEqual([]);
  });

  test('accepts minute and hour durations in sequence items', async () => {
    expect(
      await timeErrors(`sequence { selectElement("#a") for 1m  selectElement("#b") for 0.5h }`)
    ).toEqual([]);
  });

  test('does not flag property-chain or relative stagger durations', async () => {
    expect(
      await timeErrors(`stagger 200ms items with selectElement(".item") for $globaldata.duration`)
    ).toEqual([]);
    expect(await timeErrors(`stagger 200ms items with selectElement(".item") for +1s`)).toEqual([]);
  });

  test('still rejects a zero stagger delay expressed in another unit', async () => {
    const errors = await timeErrors(`stagger 0ms items with selectElement(".item") for 1m`);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('delay');
  });
});
