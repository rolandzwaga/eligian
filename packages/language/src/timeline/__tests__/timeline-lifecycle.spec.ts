/**
 * Audit idea #6: timeline lifecycle blocks `on enter [ .. ]` / `on leave [ .. ]`.
 * The runtime behaviour on the real Eligius engine is checked in
 * timeline-lifecycle-engine.spec.ts.
 */
import { Effect } from 'effect';
import { beforeAll, describe, expect, test } from 'vitest';
import {
  createTestContext,
  DiagnosticSeverity,
  type TestContext,
} from '../../__tests__/test-helpers.js';
import { transformAST } from '../../compiler/ast-transformer.js';
import { emitJSON, optimize, typeCheck } from '../../compiler/pipeline.js';
import { duplicateLifecycleMessage } from '../../utils/timeline-lifecycle.js';

describe('timeline lifecycle blocks (audit idea #6)', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  async function check(code: string) {
    const { diagnostics, program, document } = await ctx.parseAndValidate(code);
    expect(document.parseResult.parserErrors).toHaveLength(0);
    const of = (severity: DiagnosticSeverity) =>
      diagnostics.filter(d => d.severity === severity).map(d => d.message);
    return {
      errors: of(DiagnosticSeverity.Error),
      warnings: of(DiagnosticSeverity.Warning),
      diagnostics,
      program,
    };
  }

  /** The emitted Eligius configuration of `code`. */
  async function compiled(code: string) {
    const { program } = await check(code);
    return Effect.runPromise(
      transformAST(program).pipe(
        Effect.flatMap(typeCheck),
        Effect.flatMap(optimize),
        Effect.flatMap(emitJSON)
      )
    );
  }

  const CHAPTER = `endable action mark(sel) [ selectElement(sel) ] [ selectElement(sel) ]
timeline "Chapter" in "#stage" using raf {
  on enter [ selectElement("#chapter") mark("#chapter") ]
  on leave [ mark("#chapter") ]
  at +1s for 5s [ selectElement("#a") ]
  at +0s for 2s [ selectElement("#a") ]
}`;

  test('compile to one open-ended timeline action, first, outside the duration', async () => {
    const config = await compiled(CHAPTER);
    const timeline = config.timelines[0];
    const [lifecycle, ...events] = timeline.timelineActions;

    expect(lifecycle.duration).toEqual({ start: 0 });
    expect(lifecycle.startOperations.map(o => o.systemName)).toEqual([
      'selectElement',
      'requestAction',
      'startAction',
    ]);
    // An endable action called in `on leave` is ended, not started again
    expect(lifecycle.endOperations.map(o => o.systemName)).toEqual(['requestAction', 'endAction']);
    // Relative times count from the content, not from the lifecycle action
    expect(events.map(e => e.duration)).toEqual([
      { start: 1, end: 6 },
      { start: 6, end: 8 },
    ]);
    expect(timeline.duration).toBe(8);
  });

  test('may come in either order and between events; only on leave is fine too', async () => {
    const config = await compiled(`timeline "t" in "#stage" using raf {
  at 0s..2s [ selectElement("#a") ]
  on leave [ selectElement("#b") ]
}`);
    const [lifecycle] = config.timelines[0].timelineActions;
    expect(lifecycle.startOperations).toEqual([]);
    expect(lifecycle.endOperations.map(o => o.systemName)).toEqual(['selectElement']);
    expect(config.timelines[0].duration).toBe(2);
  });

  test('a timeline with only lifecycle blocks (a hub) is valid and not reported as empty', async () => {
    const { errors, warnings } = await check(`timeline "Hub" in "#stage" using raf {
  on enter [ selectElement("#hub") on click "#card" navigate "Hub" ]
  on leave [ selectElement("#hub") ]
}`);
    // No stylesheet is imported here, so only the CSS checks complain
    expect(errors.filter(e => !e.startsWith('Unknown CSS'))).toEqual([]);
    expect(warnings.filter(w => w.includes('no events'))).toEqual([]);
    expect(
      (await compiled('timeline "Hub" in "#stage" using raf { on enter [ ] }')).timelines[0]
        .duration
    ).toBe(0);
  });

  test('a second on enter or on leave is an error, in the editor and the compiler', async () => {
    const code = `timeline "t" in "#stage" using raf {
  on enter [ selectElement("#a") ]
  on leave [ selectElement("#a") ]
  on enter [ selectElement("#b") ]
}`;
    const { errors, program } = await check(code);
    expect(errors).toContain(duplicateLifecycleMessage('enter'));

    const result = await Effect.runPromise(Effect.result(transformAST(program)));
    expect(result._tag).toBe('Failure');
    if (result._tag === 'Failure') {
      expect(result.failure.message).toBe(duplicateLifecycleMessage('enter'));
    }
  });

  test('operations are allowed in the blocks and checked like inline event blocks', async () => {
    const inline = await check(
      'timeline "t" in "#stage" using raf { at 0s..1s [ setElementContent("x") ] [ setElementContent("y") ] }'
    );
    const lifecycle = await check(
      'timeline "t" in "#stage" using raf { on enter [ setElementContent("x") ] on leave [ setElementContent("y") ] }'
    );
    // Same operation data findings (nothing selected yet), and no "operations cannot be used
    // directly in timeline events" error
    expect(lifecycle.errors).toEqual(inline.errors);
    expect(lifecycle.errors.length).toBeGreaterThan(0);
    expect(lifecycle.errors.some(e => e.includes('cannot be used directly'))).toBe(false);
  });

  test('enter and leave stay valid parameter, const and loop variable names', async () => {
    // Like the other contextual keywords (loop, duration): names given by Identifier
    const { errors } = await check(`const leave = "#a"
action show(enter) [ selectElement(enter) ]
timeline "t" in "#stage" using raf {
  on enter [ for (enter in ["#a"]) { selectElement(@@enter) } ]
  at 0s..1s show(@leave)
}`);
    expect(errors.filter(e => !e.startsWith('Unknown CSS'))).toEqual([]);
  });
});
