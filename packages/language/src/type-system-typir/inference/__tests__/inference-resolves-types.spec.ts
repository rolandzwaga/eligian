/**
 * Regression tests for Typir inference rules (B10, B11, B12, B29).
 *
 * Before these fixes, the import/event/languages inference callbacks returned the
 * `CustomTypeConfigurationChain` from `factory.create({...})` directly (and passed the
 * properties at the top level instead of under `{ properties: {...} }`). Typir does not
 * accept a chain as an inference result, so it treated the value as a language node and
 * re-inferred it, causing inference to silently fail. The `any`-typed factories (B12)
 * hid the mistake from the compiler.
 *
 * These tests assert UNCONDITIONALLY that `Inference.inferType()` returns a resolved
 * `Type` (not an inference problem) with the expected hover name, exercising the
 * `.create({ properties }).finish().getTypeFinal()` path end-to-end. The pre-existing
 * hover tests could not catch the regression because the hover provider replicates the
 * inference logic instead of using Typir, and their assertions were nested inside
 * `if (hover?.contents ...)` guards that pass vacuously.
 */

import { type AstNode, AstUtils } from 'langium';
import { isType } from 'typir';
import { beforeAll, describe, expect, test } from 'vitest';
import { createTestContext, type TestContext } from '../../../__tests__/test-helpers.js';
import { isDefaultImport, isLanguagesBlock, isTimedEvent } from '../../../generated/ast.js';

describe('Typir inference rules resolve to finished types (regression: B10/B11/B12/B29)', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  async function buildProgram(code: string) {
    const document = await ctx.parse(code);
    // Build with validation so AST nodes get $document links and the type system is active.
    await ctx.services.shared.workspace.DocumentBuilder.build([document], { validation: true });
    return document.parseResult.value;
  }

  /** Infer a node's type and assert it is a resolved Type, returning its hover name. */
  function inferTypeName(node: AstNode): string | undefined {
    const result = ctx.services.Eligian.typir.Inference.inferType(node);
    // The bug caused this to be an InferenceProblem[] (or unresolved) instead of a Type.
    expect(isType(result)).toBe(true);
    return isType(result) ? result.getName() : undefined;
  }

  test('DefaultImport (styles) infers a resolved Import<css> type', async () => {
    const program = await buildProgram(`
      styles "./main.css"

      timeline "demo" in "#app" using raf {}
    `);

    const node = AstUtils.streamAst(program).find(isDefaultImport);
    expect(node).toBeDefined();
    expect(inferTypeName(node as AstNode)).toBe('Import<css>');
  });

  test('LanguagesBlock infers a resolved Languages type with count and default', async () => {
    const program = await buildProgram(`
      languages {
        * "en-US" "English"
          "nl-NL" "Nederlands"
      }

      timeline "demo" in "#app" using raf {}
    `);

    const node = AstUtils.streamAst(program).find(isLanguagesBlock);
    expect(node).toBeDefined();
    expect(inferTypeName(node as AstNode)).toBe('Languages: 2 languages, default: en-US');
  });

  test('TimedEvent infers a resolved TimelineEventType with start/end times', async () => {
    const program = await buildProgram(`
      styles "./main.css"

      timeline "demo" in "#app" using raf {
        at 0s..5s selectElement("#box")
      }
    `);

    const node = AstUtils.streamAst(program).find(isTimedEvent);
    expect(node).toBeDefined();
    expect(inferTypeName(node as AstNode)).toBe('TimedEvent: 0s → 5s');
  });
});
