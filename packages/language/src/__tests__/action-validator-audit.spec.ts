/**
 * ActionValidator regressions from the 2026-10-22 codebase audit (medium findings).
 *
 * - Duplicate parameter names were not validated for regular/endable actions
 *   (only event actions had the check), so `action a(x, x)` silently shadowed
 *   the second parameter.
 * - Recursion detection identified actions by name, so a local action and a
 *   same-named private library action were treated as the same node, producing
 *   a bogus 'Recursive action call' error attached to a node of another file.
 * - if/else branch operationData state was never merged back, so a property
 *   created in BOTH branches was reported as missing after the if/else.
 */

import { URI } from 'langium';
import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import type { Diagnostic } from 'vscode-languageserver-protocol';
import {
  CSS_FIXTURES,
  createTestContext,
  createTestContextWithMockFS,
  DiagnosticSeverity,
  setupCSSRegistry,
  setupDocuments,
  type TestContext,
} from './test-helpers.js';

function errorsWithCode(diagnostics: Diagnostic[] | undefined, code: string): Diagnostic[] {
  return (diagnostics ?? []).filter(
    d => d.severity === DiagnosticSeverity.Error && (d.code ?? (d.data as any)?.code) === code
  );
}

/** Zero-based line of the first line in `code` containing `needle` (after `from`). */
function lineOf(code: string, needle: string, from = 0): number {
  const lines = code.split('\n');
  for (let i = from; i < lines.length; i++) {
    if (lines[i].includes(needle)) return i;
  }
  throw new Error(`'${needle}' not found`);
}

describe('ActionValidator audit regressions', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  beforeEach(() => {
    setupCSSRegistry(ctx, 'file:///styles.css', CSS_FIXTURES.common);
  });

  describe('duplicate action parameters (finding: duplicate parameter names)', () => {
    test('regular action with duplicate untyped parameters is an error on the later one', async () => {
      const code = `
        action a(x, x) [
          selectElement(x)
        ]
        timeline "t" in "#container" using raf {}
      `;
      const { diagnostics } = await ctx.parseAndValidate(code);
      const dups = errorsWithCode(diagnostics, 'duplicate_parameter');
      expect(dups).toHaveLength(1);
      expect(dups[0].message).toContain("Duplicate parameter name 'x'");
      // Reported on the second `x` (column of the later declaration)
      const line = code.split('\n')[dups[0].range.start.line];
      expect(dups[0].range.start.character).toBe(line.indexOf('x)'));
    });

    test('regular action with duplicate typed parameters is an error', async () => {
      const { diagnostics } = await ctx.parseAndValidate(`
        action a(x: string, x: number) [
          selectElement(x)
        ]
        timeline "t" in "#container" using raf {}
      `);
      expect(errorsWithCode(diagnostics, 'duplicate_parameter')).toHaveLength(1);
    });

    test('endable action with duplicate parameters is an error', async () => {
      const { diagnostics } = await ctx.parseAndValidate(`
        endable action a(sel: string, d, sel) [
          selectElement(sel)
        ] [
          selectElement(sel)
        ]
        timeline "t" in "#container" using raf {}
      `);
      expect(errorsWithCode(diagnostics, 'duplicate_parameter')).toHaveLength(1);
    });

    test('every repeated occurrence is reported, the first is not', async () => {
      const { diagnostics } = await ctx.parseAndValidate(`
        action a(x, y, x, x) [
          selectElement(x)
        ]
        timeline "t" in "#container" using raf {}
      `);
      expect(errorsWithCode(diagnostics, 'duplicate_parameter')).toHaveLength(2);
    });

    test('distinct parameter names produce no duplicate error', async () => {
      const { diagnostics } = await ctx.parseAndValidate(`
        action a(x: string, y: number) [
          selectElement(x)
        ]
        endable action b(p, q) [
          selectElement(p)
        ] [
          selectElement(q)
        ]
        timeline "t" in "#container" using raf {}
      `);
      expect(errorsWithCode(diagnostics, 'duplicate_parameter')).toHaveLength(0);
    });
  });

  describe('if/else operationData join (finding: branch state never merged)', () => {
    test('property created in both branches is available after the if/else', async () => {
      const { diagnostics } = await ctx.parseAndValidate(`
        styles "./styles.css"
        action t [
          if (@@currentItem) {
            selectElement("#a")
          } else {
            selectElement("#b")
          }
          addClass("button")
        ]
        timeline "t" in "#container" using raf {}
      `);
      expect(errorsWithCode(diagnostics, 'missing-dependency')).toHaveLength(0);
    });

    test('property created only in the then-branch (no else) is still missing afterwards', async () => {
      const { diagnostics } = await ctx.parseAndValidate(`
        styles "./styles.css"
        action t [
          if (@@currentItem) {
            selectElement("#a")
          }
          addClass("button")
        ]
        timeline "t" in "#container" using raf {}
      `);
      const missing = errorsWithCode(diagnostics, 'missing-dependency');
      expect(missing).toHaveLength(1);
      expect(missing[0].message).toContain('selectedElement');
    });

    test('property created in only one of two branches is still missing afterwards', async () => {
      const { diagnostics } = await ctx.parseAndValidate(`
        styles "./styles.css"
        action t [
          if (@@currentItem) {
            log("no selection here")
          } else {
            selectElement("#b")
          }
          addClass("button")
        ]
        timeline "t" in "#container" using raf {}
      `);
      expect(errorsWithCode(diagnostics, 'missing-dependency')).toHaveLength(1);
    });

    test('nested if/else joins propagate outward', async () => {
      const { diagnostics } = await ctx.parseAndValidate(`
        styles "./styles.css"
        action t [
          if (@@currentItem) {
            if (@@currentIndex) {
              selectElement("#a")
            } else {
              selectElement("#c")
            }
          } else {
            selectElement("#b")
          }
          addClass("button")
        ]
        timeline "t" in "#container" using raf {}
      `);
      expect(errorsWithCode(diagnostics, 'missing-dependency')).toHaveLength(0);
    });

    test('a for loop body still does not make its properties available afterwards', async () => {
      const { diagnostics } = await ctx.parseAndValidate(`
        styles "./styles.css"
        action t(items) [
          for (item in items) {
            selectElement("#a")
          }
          addClass("button")
        ]
        timeline "t" in "#container" using raf {}
      `);
      expect(errorsWithCode(diagnostics, 'missing-dependency')).toHaveLength(1);
    });
  });

  describe('recursion detection by identity (single file)', () => {
    test('A → B → A reports once per action, each on its own call site', async () => {
      const code = `
        action actionA() [
          actionB()
        ]
        action actionB() [
          actionA()
        ]
        timeline "t" in "#container" using raf {}
      `;
      const { diagnostics } = await ctx.parseAndValidate(code);
      const rec = errorsWithCode(diagnostics, 'recursive_action_call');
      expect(rec.map(d => d.range.start.line).sort()).toEqual(
        [
          lineOf(code, 'actionB()', lineOf(code, 'action actionA')),
          lineOf(code, 'actionA()', lineOf(code, 'action actionB')),
        ].sort()
      );
      expect(rec.some(d => d.message.includes('actionA → actionB → actionA'))).toBe(true);
      expect(rec.some(d => d.message.includes('actionB → actionA → actionB'))).toBe(true);
    });

    test('an action that only calls into a cycle is not itself reported', async () => {
      const code = `
        action entry() [
          loopA()
        ]
        action loopA() [
          loopB()
        ]
        action loopB() [
          loopA()
        ]
        timeline "t" in "#container" using raf {}
      `;
      const { diagnostics } = await ctx.parseAndValidate(code);
      const rec = errorsWithCode(diagnostics, 'recursive_action_call');
      // One per action in the cycle (loopA, loopB); entry is cycle-free.
      expect(rec).toHaveLength(2);
      expect(rec.some(d => d.range.start.line === lineOf(code, 'loopA()'))).toBe(false);
    });

    test('direct self-recursion is still reported on the self call', async () => {
      const code = `
        action again() [
          again()
        ]
        timeline "t" in "#container" using raf {}
      `;
      const { diagnostics } = await ctx.parseAndValidate(code);
      const rec = errorsWithCode(diagnostics, 'recursive_action_call');
      expect(rec).toHaveLength(1);
      expect(rec[0].range.start.line).toBe(
        lineOf(code, 'again()', lineOf(code, 'action again') + 1)
      );
      expect(rec[0].message).toContain('again → again');
    });

    test('a diamond call graph (shared callee reached twice) is not recursive', async () => {
      const { diagnostics } = await ctx.parseAndValidate(`
        action leaf() [
          selectElement("#a")
        ]
        action left() [
          leaf()
        ]
        action right() [
          leaf()
        ]
        action top() [
          left()
          right()
          leaf()
        ]
        timeline "t" in "#container" using raf {}
      `);
      expect(errorsWithCode(diagnostics, 'recursive_action_call')).toHaveLength(0);
    });
  });
});

describe('ActionValidator recursion detection across files', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContextWithMockFS();
  });

  test('a local action sharing a name with a private library action is not recursive', async () => {
    const libUri = 'file:///recursion-audit/case1/lib.eligian';
    const mainUri = 'file:///recursion-audit/case1/main.eligian';
    const docs = await setupDocuments(ctx, [
      {
        uri: libUri,
        content: `
          library lib

          private action init() [
            selectElement("#lib")
          ]

          action helper() [
            init()
          ]
        `,
      },
      {
        uri: mainUri,
        content: `
          import { helper } from "./lib.eligian"

          action init() [
            helper()
          ]

          timeline "t" in "#container" using raf {}
        `,
      },
    ]);

    expect(errorsWithCode(docs.get(mainUri)!.diagnostics, 'recursive_action_call')).toHaveLength(0);
    expect(errorsWithCode(docs.get(libUri)!.diagnostics, 'recursive_action_call')).toHaveLength(0);
  });

  test('aliased import calling a same-named library helper is not recursive', async () => {
    const libUri = 'file:///recursion-audit/case2/lib.eligian';
    const mainUri = 'file:///recursion-audit/case2/main.eligian';
    const docs = await setupDocuments(ctx, [
      {
        uri: libUri,
        content: `
          library lib

          private action go() [
            selectElement("#lib")
          ]

          action helper() [
            go()
          ]
        `,
      },
      {
        uri: mainUri,
        content: `
          import { helper as go2 } from "./lib.eligian"

          action go() [
            go2()
          ]

          timeline "t" in "#container" using raf {}
        `,
      },
    ]);

    expect(errorsWithCode(docs.get(mainUri)!.diagnostics, 'recursive_action_call')).toHaveLength(0);
  });

  test('a real cycle through an imported action is reported on the root document call site', async () => {
    const aUri = 'file:///recursion-audit/case3/a.eligian';
    const bUri = 'file:///recursion-audit/case3/b.eligian';
    const aCode = `
          library liba

          import { pong } from "./b.eligian"

          action ping() [
            pong()
          ]
        `;
    const bCode = `
          library libb

          import { ping } from "./a.eligian"

          action pong() [
            ping()
          ]
        `;
    await setupDocuments(ctx, [
      { uri: aUri, content: aCode },
      { uri: bUri, content: bCode },
    ]);
    // The parse helper builds each document as it is parsed, so a.eligian was
    // linked before b.eligian existed. Re-run the build for a (b depends on a
    // and is relinked too) so the circular imports resolve both ways.
    const workspace = ctx.services.shared.workspace;
    await workspace.DocumentBuilder.update([URI.parse(aUri)], [], undefined);
    await workspace.DocumentBuilder.build(
      [URI.parse(aUri), URI.parse(bUri)].map(u => workspace.LangiumDocuments.getDocument(u)!),
      { validation: true }
    );
    const aDoc = workspace.LangiumDocuments.getDocument(URI.parse(aUri))!;
    const bDoc = workspace.LangiumDocuments.getDocument(URI.parse(bUri))!;
    expect((aDoc.diagnostics ?? []).filter(d => d.message.includes('Could not resolve'))).toEqual(
      []
    );

    const aRec = errorsWithCode(aDoc.diagnostics, 'recursive_action_call');
    const bRec = errorsWithCode(bDoc.diagnostics, 'recursive_action_call');

    expect(aRec).toHaveLength(1);
    expect(aRec[0].range.start.line).toBe(lineOf(aCode, 'pong()'));
    expect(aRec[0].message).toContain('ping → pong → ping');

    expect(bRec).toHaveLength(1);
    expect(bRec[0].range.start.line).toBe(lineOf(bCode, 'ping()'));
    expect(bRec[0].message).toContain('pong → ping → pong');
  });
});
