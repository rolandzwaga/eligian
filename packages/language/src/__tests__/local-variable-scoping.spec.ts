/**
 * Lexical scoping of `@var` references to local `const` declarations.
 *
 * Regression tests for two audit findings (2026-10-22, medium):
 * - "`@var` references do not see consts declared in endable end blocks, inline
 *   endable blocks or event actions": locals were only collected inside an
 *   ActionDefinition, and for endable actions only from `startOperations`.
 * - "Local const scoping ignores block structure and declaration order": every
 *   const anywhere in the action was visible and the first one of a name won,
 *   so sibling branches bound to each other's declarations and uses before the
 *   declaration (or after the block) resolved.
 *
 * Expected scoping: a reference sees the consts declared before it in each
 * enclosing statement list (operations, start/end blocks, then/else, for body,
 * stagger blocks, event action body), nearest list first, then the program's
 * global consts. The end block of an endable action (named or inline) or of an
 * inline stagger block also sees the consts of its start block, as the compiler
 * does (one scope for both blocks, foldable consts are inlined); a reference to a
 * start-block const with a runtime value is a validation error, because Eligius
 * does not carry start-operation variables over to the end operations.
 */

import { Effect } from 'effect';
import { AstUtils, type LangiumDocument } from 'langium';
import { beforeAll, describe, expect, test } from 'vitest';
import { transformAST } from '../compiler/ast-transformer.js';
import {
  isVariableReference,
  type Program,
  type VariableDeclaration,
  type VariableReference,
} from '../generated/ast.js';
import { END_BLOCK_RUNTIME_CONST_CODE } from '../validators/expression-validator.js';
import { createTestContext, type TestContext } from './test-helpers.js';

const TIMELINE = `timeline "T" in "#app" using raf {
  at 0s..1s selectElement("#app")
}`;

/** All `@name` references in the document, in source order. */
function references(document: LangiumDocument, name: string): VariableReference[] {
  return AstUtils.streamAst(document.parseResult.value)
    .filter(isVariableReference)
    .filter(ref => ref.variable.$refText === name)
    .toArray()
    .sort((a, b) => (a.$cstNode?.offset ?? 0) - (b.$cstNode?.offset ?? 0));
}

/** The literal value of the declaration a reference binds to (or undefined). */
function boundValue(ref: VariableReference): unknown {
  const decl = ref.variable.ref as VariableDeclaration | undefined;
  if (!decl) return undefined;
  const value = decl.value as { value?: unknown } | undefined;
  return value?.value;
}

function unresolvedErrors(document: LangiumDocument, name: string) {
  return (document.diagnostics ?? []).filter(d =>
    d.message.includes(`Could not resolve reference to VariableDeclaration named '${name}'`)
  );
}

describe('Local const scoping (lexical)', () => {
  let ctx: TestContext;
  let counter = 0;

  beforeAll(() => {
    ctx = createTestContext();
  });

  async function build(code: string): Promise<LangiumDocument> {
    const document = await ctx.parse(code, {
      documentUri: `file:///local-scoping/doc-${++counter}.eligian`,
    });
    await ctx.services.shared.workspace.DocumentBuilder.build([document], { validation: true });
    return document;
  }

  describe('contexts that were not scoped', () => {
    test('event action bodies see their own consts', async () => {
      const doc = await build(`
        on event "foo" action handler(x) [
          const c = 1
          setData({a: @c})
        ]
        ${TIMELINE}
      `);

      const [ref] = references(doc, 'c');
      expect(ref.variable.ref).toBeDefined();
      expect(boundValue(ref)).toBe(1);
      expect(unresolvedErrors(doc, 'c')).toEqual([]);
    });

    test('endable action end blocks see their own consts', async () => {
      const doc = await build(`
        endable action e [
          selectElement("#app")
        ] [
          const c = 1
          setData({a: @c})
        ]
        ${TIMELINE}
      `);

      const [ref] = references(doc, 'c');
      expect(boundValue(ref)).toBe(1);
      expect(unresolvedErrors(doc, 'c')).toEqual([]);
    });

    test('inline endable blocks see their own consts (start and end)', async () => {
      const doc = await build(`
        timeline "T" in "#app" using raf {
          at 0s..2s [
            const c = 1
            setData({a: @c})
          ] [
            const d = 2
            setData({a: @d})
          ]
        }
      `);

      expect(boundValue(references(doc, 'c')[0])).toBe(1);
      expect(boundValue(references(doc, 'd')[0])).toBe(2);
      expect(unresolvedErrors(doc, 'c')).toEqual([]);
      expect(unresolvedErrors(doc, 'd')).toEqual([]);
    });

    test('the end block sees the consts of the start block', async () => {
      const doc = await build(`
        endable action e [
          const c = 1
          setData({a: @c})
        ] [
          setData({a: @c})
        ]
        ${TIMELINE}
      `);

      const [inStart, inEnd] = references(doc, 'c');
      expect(boundValue(inStart)).toBe(1);
      expect(boundValue(inEnd)).toBe(1);
      expect(inEnd.variable.ref).toBe(inStart.variable.ref);
      expect(unresolvedErrors(doc, 'c')).toEqual([]);
    });

    test('an end-block const shadows a start-block const of the same name', async () => {
      const doc = await build(`
        endable action e [
          const c = 1
          setData({a: @c})
        ] [
          const c = 2
          setData({a: @c})
        ]
        ${TIMELINE}
      `);

      const [, inEnd] = references(doc, 'c');
      expect(boundValue(inEnd)).toBe(2);
    });

    test.each([
      [
        'named endable action',
        `endable action show() [
          const sel = "#app"
          selectElement(@sel)
          addClass("on")
        ] [
          selectElement(@sel)
          removeClass("on")
        ]
        timeline "T" in "#app" using raf {
          at 0s..1s show()
        }`,
      ],
      [
        'inline endable action',
        `timeline "T" in "#app" using raf {
          at 0s..1s [
            const sel = "#app"
            selectElement(@sel)
            addClass("on")
          ] [
            selectElement(@sel)
            removeClass("on")
          ]
        }`,
      ],
    ])('a foldable start-block const is inlined in the end block (%s)', async (_label, code) => {
      const doc = await build(code);
      expect(unresolvedErrors(doc, 'sel')).toEqual([]);
      expect(
        (doc.diagnostics ?? []).filter(d => d.data?.code === END_BLOCK_RUNTIME_CONST_CODE)
      ).toEqual([]);

      const compiled = await Effect.runPromise(transformAST(doc.parseResult.value as Program));
      const json = JSON.stringify(compiled.config);
      expect(json).not.toContain('setVariable');
      expect(json).not.toContain('variables.sel');
      const selects = JSON.stringify(compiled.config).match(/"selector":"#app"/g) ?? [];
      expect(selects.length).toBeGreaterThanOrEqual(2);
    });

    test('a runtime start-block const referenced from the end block is an error', async () => {
      const doc = await build(`
        endable action e [
          const v = $operationdata.x
          setData({a: @v})
        ] [
          setData({a: @v})
        ]
        ${TIMELINE}
      `);

      const errors = (doc.diagnostics ?? []).filter(
        d => d.data?.code === END_BLOCK_RUNTIME_CONST_CODE
      );
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain("'v'");
      expect(errors[0].range.start.line).toBe(5);
    });
  });

  describe('block structure and declaration order', () => {
    test('same-named consts in then/else bind to their own branch', async () => {
      const doc = await build(`
        action t [
          if (@@currentItem) {
            const c = 1
            setData({a: @c})
          } else {
            const c = 2
            setData({a: @c})
          }
        ]
        ${TIMELINE}
      `);

      const [inThen, inElse] = references(doc, 'c');
      expect(boundValue(inThen)).toBe(1);
      expect(boundValue(inElse)).toBe(2);
    });

    test('a const declared in a block is not visible after the block', async () => {
      const doc = await build(`
        action t [
          if (@@currentItem) {
            const c = 1
          }
          setData({a: @c})
        ]
        ${TIMELINE}
      `);

      expect(references(doc, 'c')[0].variable.ref).toBeUndefined();
      expect(unresolvedErrors(doc, 'c')).toHaveLength(1);
    });

    test('a const is not visible before its declaration', async () => {
      const doc = await build(`
        action t [
          setData({a: @c})
          const c = 1
        ]
        ${TIMELINE}
      `);

      expect(references(doc, 'c')[0].variable.ref).toBeUndefined();
      expect(unresolvedErrors(doc, 'c')).toHaveLength(1);
    });

    test('a const is not visible in its own initializer', async () => {
      const doc = await build(`
        action t [
          const c = @c
          setData({a: @c})
        ]
        ${TIMELINE}
      `);

      const [inInit, after] = references(doc, 'c');
      expect(inInit.variable.ref).toBeUndefined();
      expect(after.variable.ref).toBeDefined();
    });

    test('a const declared earlier in the action is visible inside nested blocks', async () => {
      const doc = await build(`
        action t [
          const c = 1
          for (item in [1, 2]) {
            if (@@item) {
              setData({a: @c})
            }
          }
        ]
        ${TIMELINE}
      `);

      expect(boundValue(references(doc, 'c')[0])).toBe(1);
    });

    test('an inner const shadows an outer one only inside its block', async () => {
      const doc = await build(`
        action t [
          const c = 1
          if (@@currentItem) {
            const c = 2
            setData({a: @c})
          }
          setData({a: @c})
        ]
        ${TIMELINE}
      `);

      const [inner, outer] = references(doc, 'c');
      expect(boundValue(inner)).toBe(2);
      expect(boundValue(outer)).toBe(1);
    });

    test('a redeclared const binds to the nearest preceding declaration', async () => {
      const doc = await build(`
        action t [
          const c = 1
          setData({a: @c})
          const c = 2
          setData({a: @c})
        ]
        ${TIMELINE}
      `);

      const [first, second] = references(doc, 'c');
      expect(boundValue(first)).toBe(1);
      expect(boundValue(second)).toBe(2);
    });

    test('locals shadow globals, and globals stay visible everywhere', async () => {
      const doc = await build(`
        const g = 10
        const c = 20

        action t [
          setData({a: @c})
          const c = 1
          setData({a: @c, b: @g})
        ]
        ${TIMELINE}
      `);

      const [beforeLocal, afterLocal] = references(doc, 'c');
      expect(boundValue(beforeLocal)).toBe(20);
      expect(boundValue(afterLocal)).toBe(1);
      expect(boundValue(references(doc, 'g')[0])).toBe(10);
    });

    test('stagger start and end blocks see their own consts', async () => {
      const doc = await build(`
        timeline "T" in "#app" using raf {
          stagger 100ms [1, 2] for 1s [
            const c = 1
            setData({a: @c})
          ] [
            const d = 2
            setData({a: @d})
          ]
        }
      `);

      expect(boundValue(references(doc, 'c')[0])).toBe(1);
      expect(boundValue(references(doc, 'd')[0])).toBe(2);
    });
  });
});
