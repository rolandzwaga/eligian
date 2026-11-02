/**
 * Audit idea #11: sequence items with inline blocks (`for 7s [ .. ] [ .. ]`),
 * a shared `each [ .. ]` prelude and `then [ .. ]` postlude, and labeled items
 * (`as explain`, used as `explain.start` / `explain.end`).
 */
import { Effect } from 'effect';
import { expectCompletion } from 'langium/test';
import { beforeAll, describe, expect, test } from 'vitest';
import type { CompletionList, InlayHint } from 'vscode-languageserver';
import {
  createTestContext,
  DiagnosticSeverity,
  type TestContext,
} from '../../__tests__/test-helpers.js';
import { transformAST } from '../../compiler/ast-transformer.js';
import { resolveTimelineTimes } from '../../compiler/transformers/time-resolver.js';
import { isTimeline } from '../../generated/ast.js';
import type { EligianInlayHintProvider } from '../../lsp/eligian-inlay-hint-provider.js';
import { laterEventMessage } from '../../utils/time-constants.js';

describe('sequence items with inline blocks, each / then and labels (audit idea #11)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = createTestContext();
    // The inlay hint provider reads the client settings once ready; let that settle
    ctx.services.Eligian.lsp.InlayHintProvider;
    await new Promise(resolve => setTimeout(resolve, 0));
  });

  async function check(code: string) {
    const { diagnostics, program, document } = await ctx.parseAndValidate(code);
    expect(document.parseResult.parserErrors).toHaveLength(0);
    const errors = diagnostics
      .filter(d => d.severity === DiagnosticSeverity.Error)
      .filter(d => !d.message.startsWith('Unknown CSS'));
    return { errors, program, document };
  }

  const PROGRAM = `endable action mark(sel) [ selectElement(sel) ] [ selectElement(sel) ]
timeline "t" in "#stage" using raf {
  at 0s..2s [ selectElement("#a") ]
  sequence each [ selectElement("#b") ] then [ selectElement("#c") ] {
    for 7s as explain [ selectElement("#code") ] [ selectElement("#code") ]
    mark("#a") for 8s
    for explain.end - explain.start [ selectElement("#a") ]
  }
  at explain.end for 1s [ selectElement("#a") ]
}`;

  test('compile with the prelude before and the postlude after every item', async () => {
    const { errors, program } = await check(PROGRAM);
    expect(errors.map(e => e.message)).toEqual([]);
    const ir = await Effect.runPromise(transformAST(program));
    const actions = ir.config.timelines[0].timelineActions.map(a => ({
      name: a.name,
      duration: a.duration,
      start: a.startOperations.map(o => o.systemName),
      end: a.endOperations.map(o => o.systemName),
    }));

    expect(actions).toEqual([
      {
        name: 'timeline-action-0-2',
        duration: { start: 0, end: 2 },
        start: ['selectElement'],
        end: [],
      },
      {
        name: 'sequence-item-2-9',
        duration: { start: 2, end: 9 },
        start: ['selectElement', 'selectElement'],
        end: ['selectElement', 'selectElement'],
      },
      {
        name: 'sequence-mark-9-17',
        duration: { start: 9, end: 17 },
        start: ['selectElement', 'requestAction', 'startAction'],
        end: ['requestAction', 'endAction', 'selectElement'],
      },
      {
        // explain.end - explain.start: a label of an earlier item of the same sequence
        name: 'sequence-item-17-24',
        duration: { start: 17, end: 24 },
        start: ['selectElement', 'selectElement'],
        end: ['selectElement'],
      },
      // explain.end after the sequence
      {
        name: 'timeline-action-9-10',
        duration: { start: 9, end: 10 },
        start: ['selectElement'],
        end: [],
      },
    ]);
    // The prelude's operation is the first start operation, the postlude's the last end one
    const item = ir.config.timelines[0].timelineActions[1];
    expect(item.startOperations[0].operationData).toEqual({ selector: '#b' });
    expect(item.endOperations[1].operationData).toEqual({ selector: '#c' });
  });

  test('the editor resolves the same times (inlay hints, CodeLenses)', async () => {
    const { program } = await check(PROGRAM);
    const ir = await Effect.runPromise(transformAST(program));
    const resolved = resolveTimelineTimes(program.statements.find(isTimeline)!);

    expect([...resolved.events.values()].flat().map(s => [s.start, s.end])).toEqual(
      ir.config.timelines[0].timelineActions.map(a => [a.duration.start, a.duration.end])
    );
    expect(resolved.duration).toBe(ir.config.timelines[0].duration);
  });

  test('an inline item shows its time after the duration', async () => {
    const code = `timeline "t" in "#stage" using raf {
  sequence {
    for 7s [ selectElement("#a") ]
  }
}`;
    const { document } = await check(code);
    const provider = ctx.services.Eligian.lsp.InlayHintProvider as EligianInlayHintProvider;
    provider.setParameterNameHints('none');
    try {
      const hints = (await provider.getInlayHints(document, {
        textDocument: { uri: document.uri.toString() },
        range: {
          start: { line: 0, character: 0 },
          end: document.textDocument.positionAt(code.length),
        },
      })) as InlayHint[];
      const hint = hints.find(h => h.label === '‹0s..7s›');
      expect(hint).toBeDefined();
      const offset = document.textDocument.offsetAt(hint!.position);
      expect(code.slice(offset - 6, offset)).toBe('for 7s');
    } finally {
      provider.setParameterNameHints('literals');
    }
  });

  test('operations in the blocks are checked like inline event blocks; each block once', async () => {
    const { errors } = await check(`timeline "t" in "#stage" using raf {
  sequence each [ setElementContent("x") ] {
    for 1s [ selectElement("#a") ]
    for 1s [ selectElement("#a") ]
    for 1s [ selectElement("#a") ]
  }
}`);
    const messages = errors.map(e => e.message);
    // Nothing is selected before the prelude's operation: one finding, not one per item
    expect(messages).toHaveLength(1);
    expect(messages.some(m => m.includes('cannot be used directly'))).toBe(false);
  });

  test('a label of a later item, or a duplicate label, is an error', async () => {
    const { errors } = await check(`timeline "t" in "#stage" using raf {
  sequence {
    for second.end [ selectElement("#a") ]
    for 1s as second [ selectElement("#a") ]
  }
  at 0s..1s as second [ selectElement("#a") ]
}`);
    const messages = errors.map(e => e.message);
    expect(messages).toContain(laterEventMessage('second'));
    expect(messages).toContain("Duplicate event label 'second' in this timeline");
  });

  test('completion offers operations inside the blocks', async () => {
    const labelsAt = async (text: string) => {
      let labels: string[] = [];
      await expectCompletion(ctx.services.Eligian)({
        text,
        index: 0,
        assert: (completions: CompletionList) => {
          labels = completions.items.map(i => i.label);
        },
      });
      return labels;
    };
    const timeline = (body: string) => `timeline "t" in "#stage" using raf {\n  ${body}\n}`;

    for (const body of [
      'sequence { for 1s [ <|> ] }',
      'sequence each [ <|> ] { for 1s [ selectElement("#a") ] }',
      'sequence { for 1s [ selectElement("#a") ] [ <|> ] }',
    ]) {
      const labels = await labelsAt(timeline(body));
      expect(
        labels.some(l => l.startsWith('addClass')),
        body
      ).toBe(true);
    }
  });
});
