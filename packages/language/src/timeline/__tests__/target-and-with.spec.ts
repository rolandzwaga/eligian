/**
 * Audit idea #17: `at … target "<sel>"`, `with <sel> { ops }` and the
 * 'Insert selectElement(…)' quick fix.
 */
import { Effect } from 'effect';
import type { LangiumDocument } from 'langium';
import { beforeAll, describe, expect, test } from 'vitest';
import type { CodeAction, Diagnostic, TextEdit } from 'vscode-languageserver-protocol';
import {
  createTestContext,
  DiagnosticSeverity,
  setupCSSRegistry,
  type TestContext,
} from '../../__tests__/test-helpers.js';
import { transformAST } from '../../compiler/ast-transformer.js';
import type { Program } from '../../generated/ast.js';
import { formatSource } from '../../lsp/format-source.js';

describe('target-scoped events and with blocks (audit idea #17)', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  async function check(code: string) {
    setupCSSRegistry(ctx, 'file:///styles.css', {
      classes: ['visible', 'spot', 'show', 'on', 'tok', 'callout'],
      ids: ['stage', 'box', 'a'],
    });
    const { diagnostics, program, document } = await ctx.parseAndValidate(
      `styles "./styles.css"\n${code}`
    );
    expect(document.parseResult.parserErrors).toHaveLength(0);
    const errors = diagnostics.filter(d => d.severity === DiagnosticSeverity.Error);
    return { errors, program, document };
  }

  async function compiled(program: Program) {
    return Effect.runPromise(transformAST(program));
  }

  const names = (ops: ReadonlyArray<{ systemName: string; operationData?: unknown }>) =>
    ops.map(o =>
      o.systemName === 'selectElement'
        ? `selectElement(${(o.operationData as { selector: unknown }).selector})`
        : o.systemName
    );

  test('target selects the element at the head of the start and end blocks', async () => {
    const { errors, program } =
      await check(`endable action mark(sel) [ selectElement(sel) ] [ selectElement(sel) ]
timeline "t" in "#stage" using raf {
  at 0s..5s target "#box" [ addClass("visible") ] [ removeClass("visible") ]
  at 5s..6s target "#box" mark("#box")
  at 6s..7s target "#box" [ addClass("on") ]
}`);
    // addClass/removeClass get their selectedElement from the target: no dataflow errors
    expect(errors.map(e => e.message)).toEqual([]);

    const ir = await compiled(program);
    const [first, second, third] = ir.config.timelines[0].timelineActions;
    expect(names(first.startOperations)).toEqual(['selectElement(#box)', 'addClass']);
    expect(names(first.endOperations)).toEqual(['selectElement(#box)', 'removeClass']);
    expect(names(second.startOperations)).toEqual([
      'selectElement(#box)',
      'requestAction',
      'startAction',
    ]);
    expect(names(second.endOperations)).toEqual([
      'selectElement(#box)',
      'requestAction',
      'endAction',
    ]);
    // No end block: nothing to select in it
    expect(third.endOperations).toEqual([]);
  });

  test('with selects an element for its operations; the selection stays after it', async () => {
    const { errors, program } = await check(`action clearSpots() [
  with ".tok" { removeClass("spot") }
  with ".callout" { removeClass("show") }
  addClass("on")
]
action reveal(sel) [ with "#" + sel { addClass("visible") } ]
timeline "t" in "#stage" using raf { at 0s..1s clearSpots() }`);
    expect(errors.map(e => e.message)).toEqual([]);

    const ir = await compiled(program);
    const clear = ir.config.actions.find(a => a.name === 'clearSpots')!;
    expect(names(clear.startOperations)).toEqual([
      'selectElement(.tok)',
      'removeClass',
      'selectElement(.callout)',
      'removeClass',
      'addClass',
    ]);
    // A runtime selector is computed first, like an operation argument
    const reveal = ir.config.actions.find(a => a.name === 'reveal')!;
    expect(reveal.startOperations.map(o => o.systemName)).toContain('selectElement');
    expect(reveal.startOperations[reveal.startOperations.length - 1]?.systemName).toBe('addClass');
  });

  test('target and with selectors are checked against the imported CSS', async () => {
    const { errors } = await check(`action a() [ with ".nope" { addClass("on") } ]
timeline "t" in "#stage" using raf { at 0s..1s target "#missing" [ addClass("on") ] }`);
    const messages = errors.map(e => e.message);
    expect(messages).toContain("Unknown CSS ID in selector: 'missing'.");
    expect(messages.some(m => m.startsWith("Unknown CSS class in selector: 'nope'"))).toBe(true);
  });

  describe("quick fix 'Insert selectElement(…)'", () => {
    async function fixes(code: string) {
      const { document } = await check(code);
      const diagnostics = (document.diagnostics ?? []).filter(d =>
        d.message.includes("'selectedElement'")
      ) as Diagnostic[];
      expect(diagnostics.length).toBeGreaterThan(0);
      const actions = (await ctx.services.Eligian.lsp.CodeActionProvider!.getCodeActions(
        document as LangiumDocument,
        {
          textDocument: { uri: document.uri.toString() },
          range: diagnostics[0].range,
          context: { diagnostics: [diagnostics[0]] },
        }
      )) as CodeAction[];
      const fix = actions.find(
        a => a.title.startsWith('Insert selectElement') || a.title.startsWith('Add target')
      );
      const [edit] = (fix?.edit?.changes?.[document.uri.toString()] ?? []) as TextEdit[];
      return { fix, edit, document };
    }

    test('uses the selector of the sibling block, inline', async () => {
      const { fix, edit } = await fixes(
        'timeline "t" in "#stage" using raf { at 0s..1s [ selectElement("#box") addClass("on") ] [ removeClass("on") ] }'
      );
      expect(fix?.title).toBe('Insert selectElement("#box")');
      expect(edit.newText).toBe('selectElement("#box") ');
    });

    test('inserts a line above, with the indentation, in a multi-line block', async () => {
      const code = `timeline "t" in "#stage" using raf {
  at 0s..1s [
    addClass("on")
  ] [ selectElement("#box") removeClass("on") ]
}`;
      const { fix, edit, document } = await fixes(code);
      expect(fix?.title).toBe('Insert selectElement("#box")');
      const text = document.textDocument.getText();
      const at = document.textDocument.offsetAt(edit.range.start);
      expect(text.slice(0, at) + edit.newText + text.slice(at)).toContain(
        ['  at 0s..1s [', '    selectElement("#box")', '    addClass("on")', '  ]'].join('\n')
      );
    });

    test('an action called as an event gets a target with the selector it is passed', async () => {
      const { fix, edit } = await fixes(`action show(sel) [ addClass("on") ]
timeline "t" in "#stage" using raf { at 0s..1s show("#a") }`);
      expect(fix?.title).toBe('Add target "#a"');
      expect(edit.newText).toBe('target "#a" ');
    });
  });

  test('the formatter knows target and with', async () => {
    const formatted = await formatSource(`action a() [
with   ".tok"{ removeClass("spot") }
]
timeline "t" in "#stage" using raf {
at 0s..1s   target  "#box" [ addClass("on") ]
}`);
    expect(formatted.text).toBe(`action a() [
  with ".tok" { removeClass("spot") }
]

timeline "t" in "#stage" using raf {
  at 0s..1s target "#box" [ addClass("on") ]
}`);
  });
});
