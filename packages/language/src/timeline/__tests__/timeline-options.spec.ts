/**
 * Feature 049: timeline header options `using scroll "<selector>"`, `loop`
 * and `duration <time>`.
 */
import { Effect } from 'effect';
import { beforeAll, describe, expect, test } from 'vitest';
import type { MarkupContent } from 'vscode-languageserver-protocol';
import {
  createTestContext,
  DiagnosticSeverity,
  type TestContext,
} from '../../__tests__/test-helpers.js';
import { transformAST } from '../../compiler/ast-transformer.js';
import {
  RELATIVE_DURATION_MESSAGE,
  SCROLL_DURATION_REQUIRED_MESSAGE,
} from '../../utils/time-units.js';

describe('timeline header options (Feature 049)', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  const EVENTS = 'at 0s..10s [ selectElement("#a") ]';

  async function check(code: string) {
    const { diagnostics, program, document } = await ctx.parseAndValidate(code);
    expect(document.parseResult.parserErrors).toHaveLength(0);
    const result = await Effect.runPromise(Effect.result(transformAST(program)));
    const of = (severity: DiagnosticSeverity) =>
      diagnostics.filter(d => d.severity === severity).map(d => d.message);
    return {
      errors: of(DiagnosticSeverity.Error),
      warnings: of(DiagnosticSeverity.Warning),
      result,
      document,
    };
  }

  async function timelineOf(header: string, events = EVENTS) {
    const { result } = await check(`timeline "t" in ".c" using ${header} { ${events} }`);
    expect(result._tag).toBe('Success');
    if (result._tag !== 'Success') throw new Error('compile failed');
    return result.success.config.timelines[0];
  }

  describe('compiled configuration', () => {
    test('loop is off by default and on with the loop option', async () => {
      expect((await timelineOf('raf')).loop).toBe(false);
      expect((await timelineOf('raf loop')).loop).toBe(true);
    });

    test('an explicit duration replaces the one inferred from the events', async () => {
      expect((await timelineOf('raf')).duration).toBe(10);
      expect((await timelineOf('raf duration 30s')).duration).toBe(30);
      expect((await timelineOf('raf loop duration 2m')).duration).toBe(120);
    });

    test('a scroll timeline is an animation timeline with its own ScrollPositionSource', async () => {
      const timeline = await timelineOf('scroll "#scroller" duration 120s');
      expect(timeline.type).toBe('animation');
      expect(timeline.duration).toBe(120);
      expect(timeline.positionSource).toEqual({
        systemName: 'ScrollPositionSource',
        selector: '#scroller',
        duration: 120,
      });
    });

    test('the scroll element defaults to the timeline container', async () => {
      const timeline = await timelineOf('scroll duration 60s');
      expect(timeline.positionSource).toMatchObject({ selector: '.c', duration: 60 });
    });
  });

  describe('validation (editor and compiler agree)', () => {
    test('a scroll timeline needs a duration', async () => {
      const { errors, result } = await check(`timeline "t" in ".c" using scroll { ${EVENTS} }`);
      expect(errors).toContain(SCROLL_DURATION_REQUIRED_MESSAGE);
      expect(result._tag).toBe('Failure');
      if (result._tag === 'Failure') {
        expect(result.failure.message).toBe(SCROLL_DURATION_REQUIRED_MESSAGE);
      }
    });

    test('only scroll timelines take a scroll selector', async () => {
      const { errors } = await check(`timeline "t" in ".c" using raf "#scroller" { ${EVENTS} }`);
      expect(
        errors.some(e => e.startsWith('Only scroll timelines take a scroll container selector'))
      ).toBe(true);
    });

    test.each([
      ['0s', 'Timeline duration must be greater than 0 (got 0s)'],
      ['+5s', RELATIVE_DURATION_MESSAGE],
    ])('duration %s is an error', async (duration, message) => {
      const { errors } = await check(
        `timeline "t" in ".c" using raf duration ${duration} { ${EVENTS} }`
      );
      expect(errors).toContain(message);
    });

    test('a property chain as duration is reported like other time slots', async () => {
      const { errors } = await check(
        `timeline "t" in ".c" using raf duration $globaldata.len { ${EVENTS} }`
      );
      expect(
        errors.some(e => e.startsWith('Property references are not supported in time expressions'))
      ).toBe(true);
    });

    test('an event ending after the explicit duration is a warning', async () => {
      const { warnings, result } = await check(
        `timeline "t" in ".c" using raf duration 5s { ${EVENTS} }`
      );
      expect(warnings).toContain(
        "This event ends at 10s, after the timeline's duration (5s), so its end is never reached"
      );
      expect(result._tag).toBe('Success');
    });
  });

  test('loop, duration and scroll stay usable as names', async () => {
    const { errors, result } = await check(`
      action fade(duration, loop, scroll) [ selectElement("#a") wait(duration) ]
      timeline "t" in ".c" using raf { at 0s..1s fade(500, true, 1) }
    `);
    // (no stylesheet is imported here, so CSS diagnostics are expected)
    expect(errors.filter(e => !e.includes('CSS'))).toEqual([]);
    expect(result._tag).toBe('Success');
  });

  test('hovering the timeline header shows provider, duration and loop', async () => {
    const code = `timeline "Story" in ".c" using scroll "#scroller" loop duration 120s { ${EVENTS} }`;
    const { document } = await check(code);
    const hover = await ctx.services.Eligian.lsp.HoverProvider?.getHoverContent(document, {
      textDocument: { uri: document.uri.toString() },
      position: document.textDocument.positionAt(code.indexOf('using') + 1),
    });

    expect(hover).toBeDefined();
    const text = (hover!.contents as MarkupContent).value;
    expect(text).toContain('### Timeline "Story"');
    expect(text).toContain('- **Provider:** scroll (`#scroller`)');
    expect(text).toContain('- **Duration:** 120s (explicit)');
    expect(text).toContain('- **Loops:** yes');
  });
});
