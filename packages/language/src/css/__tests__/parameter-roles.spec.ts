/**
 * Selectors and class names through action parameters, checked against the
 * CSS and the layout HTML (audit idea #18).
 */
import type { LangiumDocument } from 'langium';
import { expectCompletion } from 'langium/test';
import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import type { CodeAction, CompletionList, Diagnostic } from 'vscode-languageserver-protocol';
import {
  createTestContext,
  DiagnosticSeverity,
  setupCSSRegistry,
  type TestContext,
} from '../../__tests__/test-helpers.js';
import { isActionDefinition, type Program } from '../../generated/ast.js';
import { parameterRoles } from '../parameter-roles.js';

const LAYOUT =
  '<div id="stage"><code id="tok-timeline" class="tok"></code><div id="hub"></div></div>';

describe('selectors and class names through action parameters (audit idea #18)', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  beforeEach(() => {
    // The CSS knows the classes; most ids exist only in the layout
    setupCSSRegistry(ctx, 'file:///styles.css', { classes: ['spot', 'on', 'tok'], ids: ['stage'] });
  });

  async function validate(code: string, layout: string | undefined = LAYOUT) {
    // The CSS registration follows the program's own `styles` import
    const document = await ctx.parse(`styles "./styles.css"
${code}`);
    const uri = document.uri.toString();
    ctx.services.Eligian.css.CSSRegistry.registerImports(uri, ['file:///styles.css']);
    if (layout !== undefined) {
      const html = ctx.services.Eligian.html.HTMLRegistry;
      html.updateHTMLFile('file:///layout.html', { content: layout });
      html.registerImports(uri, 'file:///layout.html');
    }
    await ctx.services.shared.workspace.DocumentBuilder.build([document], { validation: true });
    const errors = (document.diagnostics ?? []).filter(
      d => d.severity === DiagnosticSeverity.Error && !d.message.startsWith('Recursive action call')
    );
    return { document, errors, program: document.parseResult.value as Program };
  }

  const LIBRARY_ACTIONS = `action spotlight(selector: string) [ selectElement(selector) addClass("spot") ]
action mark(name) [ selectElement("#stage") addClass(name) ]
action focus(target) [ spotlight(target) ]
action both(x) [ selectElement(x) addClass(x) ]
action built(id) [ selectElement("#" + id) ]
action scoped(sel) [ with sel { addClass("on") } ]
action again(sel) [ again(sel) ]`;

  test('infers which parameters are selectors and class names', async () => {
    const { program } = await validate(LIBRARY_ACTIONS);
    const roles = Object.fromEntries(
      program.statements
        .filter(isActionDefinition)
        .map(action => [action.name, Object.fromEntries(parameterRoles(action))])
    );

    expect(roles).toEqual({
      spotlight: { selector: 'selector' },
      mark: { name: 'className' },
      focus: { target: 'selector' }, // through spotlight
      both: {}, // selector and class name: no role
      built: {}, // only inside an expression
      scoped: { sel: 'selector' }, // with
      again: {}, // recursion
    });
  });

  test('checks literals passed to them, ids against the layout too, with suggestions', async () => {
    const { errors } = await validate(`${LIBRARY_ACTIONS}
timeline "t" in "#stage" using raf {
  at 0s..1s spotlight("#tok-timeline")
  at 1s..2s spotlight("#tok-timelin")
  at 2s..3s focus("#hub")
  at 3s..4s mark("spto")
  at 4s..5s spotlight(".tok")
}`);
    const messages = errors.map(e => e.message);

    // #tok-timeline and #hub exist only in the layout: no errors for them
    expect(messages).toEqual([
      "Unknown CSS ID in selector: 'tok-timelin'. Did you mean: tok-timeline?",
      "Unknown CSS class: 'spto'. Did you mean: spot?",
    ]);
  });

  test("offers 'Change to …' for a suggestion", async () => {
    const { document, errors } = await validate(`${LIBRARY_ACTIONS}
timeline "t" in "#stage" using raf { at 0s..1s spotlight("#tok-timelin") }`);
    const diagnostic = errors.find(e => e.message.includes('tok-timelin')) as Diagnostic;
    const actions = (await ctx.services.Eligian.lsp.CodeActionProvider!.getCodeActions(
      document as LangiumDocument,
      {
        textDocument: { uri: document.uri.toString() },
        range: diagnostic.range,
        context: { diagnostics: [diagnostic] },
      }
    )) as CodeAction[];
    const change = actions.find(a => a.title === "Change to 'tok-timeline'");
    expect(change?.isPreferred).toBe(true);
    const [edit] = change!.edit!.changes![document.uri.toString()];
    expect(document.textDocument.getText(edit.range)).toBe('tok-timelin');
    expect(edit.newText).toBe('tok-timeline');
  });

  test('completion offers the ids of the CSS and the layout for a selector parameter', async () => {
    const code = `action spotlight(selector) [ selectElement(selector) ]
timeline "t" in "#stage" using raf { at 0s..1s spotlight("#<|>") }`;
    let labels: string[] = [];
    // Register the layout for the document the completion test parses
    const html = ctx.services.Eligian.html.HTMLRegistry;
    html.updateHTMLFile('file:///layout.html', { content: LAYOUT });
    const original = html.getHTMLForDocument.bind(html);
    html.getHTMLForDocument = () => original('file:///any') ?? { content: LAYOUT };
    try {
      await expectCompletion(ctx.services.Eligian)({
        text: code,
        index: 0,
        assert: (completions: CompletionList) => {
          labels = completions.items.map(i => i.label);
        },
      });
    } finally {
      html.getHTMLForDocument = original;
    }
    expect(labels).toEqual(expect.arrayContaining(['stage', 'tok-timeline', 'hub']));
  });

  test('hover and signature help name the role', async () => {
    const { document } = await validate(`${LIBRARY_ACTIONS}
timeline "t" in "#stage" using raf { at 0s..1s spotlight("#hub") }`);
    const text = document.textDocument.getText();
    const hover = await ctx.services.Eligian.lsp.HoverProvider!.getHoverContent(document, {
      textDocument: { uri: document.uri.toString() },
      position: document.textDocument.positionAt(text.indexOf('spotlight') + 2),
    });
    expect(JSON.stringify(hover?.contents)).toContain('Parameters checked at call sites');

    const help = await ctx.services.Eligian.lsp.SignatureHelp!.provideSignatureHelp(document, {
      textDocument: { uri: document.uri.toString() },
      position: document.textDocument.positionAt(text.lastIndexOf('spotlight(') + 11),
    });
    expect(JSON.stringify(help?.signatures[0].parameters?.[0].documentation)).toContain(
      'CSS selector'
    );
  });
});
