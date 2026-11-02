/**
 * Audit idea #10: time constants (`const beat = 7s`, used as `@beat`), event
 * labels (`at … as intro`, used as `intro.start` / `intro.end`) and explicit
 * stagger anchors (`stagger 200ms items at <time> …`).
 */
import { Effect } from 'effect';
import { beforeAll, describe, expect, test } from 'vitest';
import {
  createTestContext,
  DiagnosticSeverity,
  type TestContext,
} from '../../__tests__/test-helpers.js';
import { transformAST } from '../../compiler/ast-transformer.js';
import { resolveTimelineTimes } from '../../compiler/transformers/time-resolver.js';
import { isTimeline } from '../../generated/ast.js';
import {
  laterEventMessage,
  TIME_VALUE_PLACEMENT_MESSAGE,
  timeConstantMisuseMessage,
} from '../../utils/time-constants.js';

describe('time constants, event labels and stagger anchors (audit idea #10)', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  async function check(code: string) {
    const { diagnostics, program, document } = await ctx.parseAndValidate(code);
    expect(document.parseResult.parserErrors).toHaveLength(0);
    const errors = diagnostics
      .filter(d => d.severity === DiagnosticSeverity.Error)
      // No stylesheet is imported in these programs
      .filter(d => !d.message.startsWith('Unknown CSS'));
    return { errors, program };
  }

  async function compile(code: string) {
    const { errors, program } = await check(code);
    expect(errors.map(e => e.message)).toEqual([]);
    const ir = await Effect.runPromise(transformAST(program));
    const timeline = ir.config.timelines[0];
    return {
      ir,
      timeline,
      spans: timeline.timelineActions.map(a => [a.duration.start, a.duration.end]),
      resolved: resolveTimelineTimes(program.statements.find(isTimeline)!),
    };
  }

  const EXAMPLE = `const beat = 7s
const outro = @beat * 2 + 500ms
const COUNT = 3
action reveal(sel) [ selectElement(sel) ]
timeline "t" in "#stage" using raf duration closing.end + 1s {
  at 15s for @beat as editBeat [ selectElement("#a") ]
  at +1s..+2s [ selectElement("#a") ]
  stagger 200ms ["#a", "#b"] at editBeat.end with reveal() for 1.5s
  at editBeat.start + @COUNT for @outro as closing [ selectElement("#b") ]
}`;

  test('compile to the times they stand for', async () => {
    const { spans, timeline, ir } = await compile(EXAMPLE);

    expect(spans).toEqual([
      [15, 22], // for @beat (7s)
      [23, 24], // relative to the previous event, as before
      [22, 23.5], // anchored at editBeat.end, not at the previous event's end (24s)
      [22.2, 23.7],
      [18, 32.5], // editBeat.start + 3, for 7s * 2 + 500ms
    ]);
    expect(timeline.duration).toBe(33.5); // closing.end + 1s
    // Time constants only exist at compile time: no global data for them
    expect(ir.config.initActions).toEqual([]);
  });

  test('the editor resolves the same times as the compiler (inlay hints, CodeLenses)', async () => {
    const { spans, resolved, timeline } = await compile(EXAMPLE);
    const events = [...resolved.events.values()].flat().map(s => [s.start, s.end]);

    expect(events).toEqual(spans);
    expect(resolved.duration).toBe(timeline.duration);
  });

  test('a relative anchor counts from the previous event', async () => {
    const { spans } = await compile(`action reveal(sel) [ selectElement(sel) ]
timeline "t" in "#stage" using raf {
  at 0s..10s [ selectElement("#a") ]
  stagger 1s ["#a", "#b"] at +2s with reveal() for 1s
}`);
    expect(spans.slice(1)).toEqual([
      [12, 13],
      [13, 14],
    ]);
  });

  test('editor errors for misused constants and labels', async () => {
    const { errors } = await check(`const beat = 7s
const name = "x"
action show(sel) [ selectElement(sel) wait(@beat) wait(2s) ]
timeline "t" in "#stage" using raf {
  at 0s..later.start [ selectElement("#a") ]
  at 1s..2s as later [ selectElement("#a") ]
  at later.middle..9s as later [ selectElement("#a") ]
  at @name..10s [ selectElement("#a") ]
}`);
    const codes = errors.map(e => (e.data as { code?: string } | undefined)?.code ?? e.code);

    expect(codes).toEqual(
      expect.arrayContaining([
        'time_constant_misuse',
        'time_value_placement',
        'event_label_not_before',
        'duplicate_event_label',
        'invalid_event_edge',
        'invalid_time_constant',
      ])
    );
    const messages = errors.map(e => e.message);
    expect(messages).toContain(timeConstantMisuseMessage('beat'));
    expect(messages).toContain(TIME_VALUE_PLACEMENT_MESSAGE);
    expect(messages).toContain(laterEventMessage('later'));
    // One error for `wait(2s)`, not a parameter type error on top
    expect(messages.filter(m => m.includes("Parameter 'milliseconds'"))).toEqual([]);
  });

  test('an event cannot refer to itself', async () => {
    const { errors } = await check(`timeline "t" in "#stage" using raf {
  at 0s..intro.start + 1s as intro [ selectElement("#a") ]
}`);
    expect(errors.map(e => e.message)).toContain(laterEventMessage('intro'));
  });

  test('the compiler rejects the same mistakes with located errors (no crash)', async () => {
    const run = async (code: string) => {
      const document = await ctx.parse(code);
      const result = await Effect.runPromise(
        Effect.result(transformAST(document.parseResult.value as never))
      );
      expect(result._tag).toBe('Failure');
      return result._tag === 'Failure' ? result.failure : undefined;
    };

    const forward = await run(`timeline "t" in "#stage" using raf {
  at 0s..later.start [ selectElement("#a") ]
  at 1s..2s as later [ selectElement("#a") ]
}`);
    expect(forward?.message).toBe(laterEventMessage('later'));
    expect(forward?.location.line).toBe(2);

    const misuse = await run(`const beat = 7s
timeline "t" in "#stage" using raf { at 0s..1s [ wait(@beat) ] }`);
    expect(misuse?.message).toBe(timeConstantMisuseMessage('beat'));
  });

  test('a number constant counts as seconds in a time, like a unitless time', async () => {
    const { spans } = await compile(`const START = 2
timeline "t" in "#stage" using raf { at @START for 1.5 [ selectElement("#a") ] }`);
    expect(spans).toEqual([[2, 3.5]]);
  });
});
