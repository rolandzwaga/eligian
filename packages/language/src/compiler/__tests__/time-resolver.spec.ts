/**
 * The static time resolver (audit idea #4) gives the times that are compiled.
 *
 * Every timeline of the real examples and a timeline using every scheduling
 * construct is resolved from the AST and compared with the compiler's output.
 */
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Effect } from 'effect';
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { beforeAll, describe, expect, test } from 'vitest';
import { createEligianServices } from '../../eligian-module.js';
import { isTimeline, type Program, type Timeline } from '../../generated/ast.js';
import { transformAST } from '../ast-transformer.js';
import { compileToIR } from '../pipeline.js';
import { resolveTimelineTimes } from '../transformers/time-resolver.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const examples = path.resolve(here, '../../../../../examples');

/** Resolved [start, end] per compiled timeline action, in order. */
function resolvedSpans(timeline: Timeline): Array<[number, number]> {
  const { events } = resolveTimelineTimes(timeline);
  return timeline.events.flatMap(event =>
    (events.get(event) ?? []).map(span => [span.start, span.end] as [number, number])
  );
}

describe('resolveTimelineTimes matches the compiler', () => {
  let parse: ReturnType<typeof parseHelper<Program>>;

  beforeAll(() => {
    parse = parseHelper<Program>(createEligianServices(EmptyFileSystem).Eligian);
  });

  test('a timeline with every scheduling construct', async () => {
    const source = `
      const ITEMS = ["#a", "#b", "#c"]
      action show(item) [ selectElement("#a") ]
      timeline "t" in ".c" using raf {
        at 0s..1.5s [ selectElement("#a") ]
        at +0.5s..+2s [ selectElement("#a") ]
        at 1s + 2s..4s * 2 [ selectElement("#a") ]
        at +0s for 300ms [ selectElement("#a") ]
        sequence { show(1) for 2s  show(2) for +1s  show(3) for 0.1s }
        stagger 0.1s @ITEMS with show() for 1s
        stagger 200ms [1, 2] for 0.5s [ selectElement("#a") ]
        at +1s for 1m [ selectElement("#a") ]
      }`;
    const doc = await parse(source);
    const timeline = doc.parseResult.value.statements.find(isTimeline)!;
    const { config } = await Effect.runPromise(transformAST(doc.parseResult.value));
    const compiled = config.timelines[0].timelineActions.map(
      a => [a.duration.start, a.duration.end] as [number, number]
    );

    expect(resolvedSpans(timeline)).toEqual(compiled);
    expect(compiled).toHaveLength(13);
    expect(resolveTimelineTimes(timeline).duration).toBe(config.timelines[0].duration);
  });

  test.each([['demo.eligian'], ['eligian-tour/tour.eligian']])(
    'every timeline of examples/%s',
    async file => {
      const sourceUri = path.join(examples, file);
      const source = readFileSync(sourceUri, 'utf-8');
      const ir = await Effect.runPromise(compileToIR(source, { sourceUri }));
      const doc = await parse(source);
      const timelines = doc.parseResult.value.statements.filter(isTimeline);

      expect(timelines.length).toBe(ir.config.timelines.length);
      timelines.forEach((timeline, index) => {
        const compiled = ir.config.timelines[index].timelineActions.map(
          a => [a.duration.start, a.duration.end] as [number, number]
        );
        expect(resolvedSpans(timeline)).toEqual(compiled);
        expect(resolveTimelineTimes(timeline).duration).toBe(ir.config.timelines[index].duration);
      });
    }
  );

  test('a runtime time leaves that event and relative ones after it unresolved', async () => {
    const doc = await parse(`timeline "t" in ".c" using raf {
      at 0s..$globaldata.end [ selectElement("#a") ]
      at +1s..+2s [ selectElement("#a") ]
      at 5s..6s [ selectElement("#a") ]
      at +0s for 1s [ selectElement("#a") ]
    }`);
    const timeline = doc.parseResult.value.statements.find(isTimeline)!;
    const times = resolveTimelineTimes(timeline);

    expect(timeline.events.map(e => times.events.get(e))).toEqual([
      undefined,
      undefined,
      [{ start: 5, end: 6 }],
      [{ start: 6, end: 7 }],
    ]);
    expect(times.duration).toBeUndefined();
  });
});
