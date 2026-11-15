/**
 * `selectElementFix`: the edit of the 'Insert selectElement(…)' / 'Add target …'
 * quick fix as a pure function of document + diagnostic (spec 058, FR-013).
 */
import type { LangiumDocument } from 'langium';
import { beforeAll, describe, expect, it } from 'vitest';
import { type CodeAction, CodeActionKind, type Diagnostic } from 'vscode-languageserver-protocol';
import {
  createTestContext,
  setupCSSRegistry,
  type TestContext,
} from '../../__tests__/test-helpers.js';
import { selectElementCodeActions, selectElementFix } from '../select-element-fix.js';

const BLOCK = 'timeline "t" in "#stage" using raf { at 0s..1s [ ] [ addClass("x") ] }';
const TARGET = `action show(sel) [ addClass("on") ]
timeline "t" in "#stage" using raf { at 0s..1s show("#a") }`;

describe('selectElementFix', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  async function load(code: string) {
    setupCSSRegistry(ctx, 'file:///styles.css', { classes: ['x', 'on'], ids: ['stage', 'a'] });
    const { document } = await ctx.parseAndValidate(`styles "./styles.css"\n${code}`);
    expect(document.parseResult.parserErrors).toHaveLength(0);
    const diagnostics = (document.diagnostics ?? []) as Diagnostic[];
    return { document: document as LangiumDocument, diagnostics };
  }

  function selectedElementDiagnostic(diagnostics: readonly Diagnostic[]): Diagnostic {
    const diagnostic = diagnostics.find(
      d => d.code === 'missing-dependency' && d.message.includes("'selectedElement'")
    );
    expect(diagnostic).toBeDefined();
    return diagnostic!;
  }

  it('block branch', async () => {
    const { document, diagnostics } = await load(BLOCK);
    const fix = selectElementFix(document, selectedElementDiagnostic(diagnostics));
    expect(fix).toBeDefined();
    expect(fix!.range.start).toEqual(fix!.range.end);
    expect(fix!.newText.startsWith('selectElement(')).toBe(true);
    expect(fix!.title.startsWith('Insert selectElement(')).toBe(true);
  });

  it('target branch', async () => {
    const { document, diagnostics } = await load(TARGET);
    const diagnostic = diagnostics.find(d => d.message.includes("'selectedElement'"));
    expect(diagnostic).toBeDefined();
    const fix = selectElementFix(document, diagnostic!);
    expect(fix).toBeDefined();
    expect(fix!.title.startsWith('Add target')).toBe(true);
    expect(fix!.newText).toContain('target "');
    expect(fix!.range.start).toEqual(fix!.range.end);
  });

  it('code actions unchanged', async () => {
    for (const code of [BLOCK, TARGET]) {
      const { document, diagnostics } = await load(code);
      const expected: CodeAction[] = diagnostics.flatMap(diagnostic => {
        const fix = selectElementFix(document, diagnostic);
        if (!fix) return [];
        return [
          {
            title: fix.title,
            kind: CodeActionKind.QuickFix,
            diagnostics: [diagnostic],
            isPreferred: true,
            edit: {
              changes: {
                [document.uri.toString()]: [{ range: fix.range, newText: fix.newText }],
              },
            },
          },
        ];
      });
      expect(expected.length).toBeGreaterThan(0);
      expect(selectElementCodeActions(document, diagnostics)).toEqual(expected);
    }
  });

  it('no fix for other diagnostics', async () => {
    const { document, diagnostics } = await load(
      'timeline "t" in "#stage" using raf { at 0s..1s [ selectElement("#a") addClas("x") ] }'
    );
    const unknown = diagnostics.find(d => d.code === 'unknown_operation');
    expect(unknown).toBeDefined();
    expect(selectElementFix(document, unknown!)).toBeUndefined();
  });
});
