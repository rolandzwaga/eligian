/**
 * Audit idea #19: `on <event> "<sel>" <verb>` with the verbs navigate, play,
 * pause, toggle, stop, seek and run.
 *
 * Transform shape through parseHelper + transformAST; diagnostics through the
 * full validation (createTestContext).
 */
import { Effect } from 'effect';
import { EmptyFileSystem } from 'langium';
import { expectCompletion, parseHelper } from 'langium/test';
import { beforeAll, describe, expect, test } from 'vitest';
import type { CompletionList } from 'vscode-languageserver-protocol';
import {
  createTestContext,
  DiagnosticSeverity,
  type TestContext,
} from '../../__tests__/test-helpers.js';
import { createEligianServices } from '../../eligian-module.js';
import type { Program } from '../../generated/ast.js';
import { transformAST } from '../ast-transformer.js';
import { interactionActionName } from '../transformers/navigate-operations.js';

const PROGRAM = `languages { * "en-US" "English" }
action highlight(sel, times) [ selectElement(sel) addClass("on") ]
timeline "Hub" in "#stage" using raf {
  on enter [
    on click "#play" play
    on click "#pause" pause
    on keydown "#stage" toggle
    on dblclick "#stop" stop
    on click "#skip" seek intro.end
    on click "#again" seek 1s + 500ms
    on mouseenter "#card" run highlight("#card", 2)
    on click "#ch" navigate "Chapter" at beat.start
  ]
  at 0s for 4s as intro [ selectElement("#a") ] [ selectElement("#a") ]
}
timeline "Chapter" in "#stage" using raf {
  at 2s..3s as beat [ selectElement("#b") ] [ selectElement("#b") ]
}`;

describe('interaction statements: transform (idea #19)', () => {
  let parse: ReturnType<typeof parseHelper<Program>>;

  beforeAll(() => {
    parse = parseHelper<Program>(createEligianServices(EmptyFileSystem).Eligian);
  });

  async function transform(source: string) {
    const document = await parse(source);
    expect(document.parseResult.parserErrors).toEqual([]);
    return Effect.runPromise(transformAST(document.parseResult.value));
  }

  test('each statement attaches a listener for its DOM event', async () => {
    const ir = await transform(PROGRAM);
    const lifecycle = ir.config.timelines[0].timelineActions.find(
      a => a.duration.end === undefined
    );
    const listeners = (lifecycle?.startOperations ?? [])
      .filter(o => o.systemName === 'addControllerToElement')
      .map(o => o.operationData);
    expect(listeners).toEqual([
      { eventName: 'click', actions: ['__on__play'] },
      { eventName: 'click', actions: ['__on__pause'] },
      { eventName: 'keydown', actions: ['__on__toggle'] },
      { eventName: 'dblclick', actions: ['__on__stop'] },
      { eventName: 'click', actions: [interactionActionName('seek', undefined, 4)] },
      { eventName: 'click', actions: [interactionActionName('seek', undefined, 1.5)] },
      {
        eventName: 'mouseenter',
        actions: ['highlight'],
        actionOperationData: { sel: '#card', times: 2 },
      },
      // `beat` is a label of the target timeline: 2s
      { eventName: 'click', actions: [interactionActionName('navigate', 'Chapter', 2)] },
    ]);
  });

  test('one synthetic action per distinct verb broadcasts the engine request', async () => {
    const ir = await transform(PROGRAM);
    const broadcasts = Object.fromEntries(
      ir.config.actions
        .filter(a => a.name.startsWith('__on__') || a.name.startsWith('__nav__'))
        .map(a => [a.name, a.startOperations[0].operationData])
    );
    expect(broadcasts).toEqual({
      __on__play: { eventName: 'timeline-play-request', eventArgs: [] },
      __on__pause: { eventName: 'timeline-pause-request', eventArgs: [] },
      __on__toggle: { eventName: 'timeline-play-toggle-request', eventArgs: [] },
      __on__stop: { eventName: 'timeline-stop-request', eventArgs: [] },
      __on__seek__4: { eventName: 'timeline-seek-request', eventArgs: [4] },
      __on__seek__1p5: { eventName: 'timeline-seek-request', eventArgs: [1.5] },
      [interactionActionName('navigate', 'Chapter', 2)]: {
        eventName: 'request-timeline-uri',
        eventArgs: ['Chapter', 2],
      },
    });
  });

  test('the same verb in two places shares one synthetic action', async () => {
    const ir = await transform(`languages { * "en-US" "English" }
timeline "t" in "#stage" using raf {
  at 0s..1s [ on click "#a" toggle on click "#b" toggle ] []
}`);
    expect(ir.config.actions.filter(a => a.name === '__on__toggle')).toHaveLength(1);
  });

  test('an action may still be called toggle or play', async () => {
    const ir = await transform(`languages { * "en-US" "English" }
action toggle(sel) [ selectElement(sel) toggleClass("on") ]
action play() [ selectElement("#x") addClass("on") ]
timeline "t" in "#stage" using raf {
  at 0s..1s [ toggle("#a") play() on click "#b" run toggle("#b") on click "#c" play ] []
}`);
    const ops = ir.config.timelines[0].timelineActions[0].startOperations;
    expect(ops.filter(o => o.systemName === 'requestAction').map(o => o.operationData)).toEqual([
      { systemName: 'toggle' },
      { systemName: 'play' },
    ]);
    expect(
      ops.filter(o => o.systemName === 'addControllerToElement').map(o => o.operationData)
    ).toEqual([
      { eventName: 'click', actions: ['toggle'], actionOperationData: { sel: '#b' } },
      { eventName: 'click', actions: ['__on__play'] },
    ]);
  });
});

describe('interaction statements: validation (idea #19)', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  async function diagnostics(body: string, actions = '') {
    const result = await ctx.parseAndValidate(`languages { * "en-US" "English" }
${actions}
timeline "t" in "#stage" using raf {
  at 0s for 2s as intro [ selectElement("#a") ] [ selectElement("#a") ]
  at 2s..3s [ ${body} ] []
}
timeline "u" in "#stage" using raf {
  at 1s..2s as later [ selectElement("#b") ] [ selectElement("#b") ]
}`);
    expect(result.document.parseResult.parserErrors).toEqual([]);
    return result.diagnostics.filter(
      d => d.severity !== DiagnosticSeverity.Hint && !String(codeOf(d)).startsWith('unknown_css')
    );
  }

  // Langium puts the code of `accept(…, { code })` on the diagnostic, of `data: { code }` in data
  const codeOf = (d: { code?: unknown; data?: unknown }) =>
    d.code ?? (d.data as { code?: unknown } | undefined)?.code;
  const codes = (list: { code?: unknown; data?: unknown }[]) => list.map(codeOf);

  test('an unknown DOM event is a warning with suggestions', async () => {
    const list = await diagnostics('on clik "#a" toggle');
    const warning = list.find(d => codeOf(d) === 'unknown_dom_event');
    expect(warning?.severity).toBe(DiagnosticSeverity.Warning);
    expect(warning?.message).toContain("Did you mean: 'click'");
  });

  test('a seek may use any label of its own timeline, a navigate those of the target', async () => {
    const list = await diagnostics(
      'on click "#a" seek intro.end on click "#b" navigate "u" at later.end'
    );
    expect(list.filter(d => d.severity === DiagnosticSeverity.Error)).toEqual([]);
  });

  test("a navigate position cannot use the current timeline's labels", async () => {
    const list = await diagnostics('on click "#a" navigate "u" at intro.end');
    const errors = list.filter(d => d.severity === DiagnosticSeverity.Error);
    expect(errors.map(d => d.message)).toEqual([expect.stringContaining("named 'intro'")]);
  });

  test('run needs an action, not an operation', async () => {
    const list = await diagnostics('on click "#a" run addClass("on")');
    expect(codes(list)).toContain('run_not_an_action');
  });

  test('run arguments must be compile-time values', async () => {
    const list = await diagnostics(
      'on click "#a" run show(@n) on click "#b" run show(@@currentItem)',
      `const n = 3
action show(count) [ selectElement("#a") addClass("on") ]
action outer(sel) [ on click "#c" run show(sel) ]`
    );
    // @n is a constant; @@currentItem and the parameter `sel` are runtime values
    expect(codes(list).filter(code => code === 'run_runtime_argument')).toHaveLength(2);
  });

  test('a run action is started without the selected element', async () => {
    const list = await diagnostics('on click "#a" run mark()', 'action mark() [ addClass("on") ]');
    const missing = list.find(d => codeOf(d) === 'missing-action-dependency');
    expect(missing?.message).toContain('not available when the event runs it');
  });
});

describe('interaction statements: completion (idea #19)', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  async function labelsAt(body: string): Promise<string[]> {
    let labels: string[] = [];
    await expectCompletion(ctx.services.Eligian)({
      text: `timeline "t" in "#stage" using raf {\n  at 0s..1s [ ${body} ] []\n}`,
      index: 0,
      assert: (completions: CompletionList) => {
        labels = completions.items.map(i => i.label);
      },
    });
    return labels;
  }

  test('DOM event names after on', async () => {
    const labels = await labelsAt('on <|>');
    expect(labels).toEqual(expect.arrayContaining(['click', 'dblclick', 'mouseenter', 'keydown']));
    expect(labels.filter(label => label.includes('(operation)'))).toEqual([]);
  });

  test('the verbs after the selector', async () => {
    const labels = await labelsAt('on click "#a" <|>');
    expect(labels).toEqual(
      expect.arrayContaining(['navigate', 'play', 'pause', 'toggle', 'stop', 'seek', 'run'])
    );
  });
});
