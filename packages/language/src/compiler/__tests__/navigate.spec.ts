/**
 * Integration tests for the `navigate` sugar.
 *
 * Verifies that `on click "#sel" navigate "Target" [at <time>]`:
 *  - expands at the call site to selectElement + getControllerInstance +
 *    addControllerToElement (DOMEventListenerController);
 *  - emits exactly one synthetic broadcast action per DISTINCT (target,
 *    position), shared across call sites (dedup);
 *  - hard-errors when the target names no timeline in the program.
 *
 * Transform-shape assertions go through parseHelper + transformAST (no semantic
 * validation, so unrelated CSS-selector checks don't interfere); the hard-error
 * assertion goes through full validation.
 */
import { Effect } from 'effect';
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { beforeAll, describe, expect, test } from 'vitest';
import {
  createTestContext,
  DiagnosticSeverity,
  type TestContext,
} from '../../__tests__/test-helpers.js';
import { createEligianServices } from '../../eligian-module.js';
import type { Program } from '../../generated/ast.js';
import { transformAST } from '../ast-transformer.js';

const HUB_AND_CHAPTER = `languages { * "en-US" "English" }
timeline "Hub" in "#stage" using raf {
  at 0s..30s [
    on click "#card-ch1" navigate "Chapter One"
    on click "#resume" navigate "Chapter One" at 5s
  ] []
}
timeline "Chapter One" in "#stage" using raf {
  at 0s..30s [
    on click "#back" navigate "Hub"
  ] []
}`;

describe('navigate sugar — transform shape', () => {
  let parse: ReturnType<typeof parseHelper<Program>>;

  beforeAll(() => {
    const services = createEligianServices(EmptyFileSystem);
    parse = parseHelper<Program>(services.Eligian);
  });

  async function parseDSL(code: string): Promise<Program> {
    const document = await parse(code);
    if (document.parseResult.parserErrors.length > 0) {
      throw new Error(
        `Parse errors: ${document.parseResult.parserErrors.map(e => e.message).join(', ')}`
      );
    }
    return document.parseResult.value;
  }

  test('expands the call site to a DOMEventListenerController click handler', async () => {
    const program = await parseDSL(HUB_AND_CHAPTER);
    const ir = await Effect.runPromise(transformAST(program));
    const hubAction = ir.config.timelines[0].timelineActions[0];

    expect(hubAction.startOperations.map(o => o.systemName)).toEqual([
      'selectElement',
      'getControllerInstance',
      'addControllerToElement',
      'selectElement',
      'getControllerInstance',
      'addControllerToElement',
    ]);

    const [sel, getInst, addCtrl] = hubAction.startOperations;
    expect(sel.operationData).toMatchObject({ selector: '#card-ch1' });
    expect(getInst.operationData).toMatchObject({ systemName: 'DOMEventListenerController' });
    expect(addCtrl.operationData).toMatchObject({
      eventName: 'click',
      actions: ['__nav__chapter_one'],
    });
  });

  test('emits one synthetic broadcast action per distinct target+position (deduped)', async () => {
    const program = await parseDSL(HUB_AND_CHAPTER);
    const ir = await Effect.runPromise(transformAST(program));
    const navActions = ir.config.actions.filter(a => a.name?.startsWith('__nav__'));

    // "Chapter One"@0 (from Hub card), "Chapter One"@5 (resume), "Hub"@0 (back)
    expect(navActions.map(a => a.name).sort()).toEqual([
      '__nav__chapter_one',
      '__nav__chapter_one__5',
      '__nav__hub',
    ]);

    const byName = (n: string) => navActions.find(a => a.name === n);
    expect(byName('__nav__chapter_one')?.startOperations[0]).toMatchObject({
      systemName: 'broadcastEvent',
      operationData: { eventName: 'request-timeline-uri', eventArgs: ['Chapter One', 0] },
    });
    expect(byName('__nav__chapter_one__5')?.startOperations[0]).toMatchObject({
      operationData: { eventArgs: ['Chapter One', 5] },
    });
    expect(byName('__nav__hub')?.startOperations[0]).toMatchObject({
      operationData: { eventArgs: ['Hub', 0] },
    });
  });

  test('two call sites to the same target+position share one synthetic action', async () => {
    const source = `languages { * "en-US" "English" }
timeline "Hub" in "#stage" using raf {
  at 0s..30s [
    on click "#a" navigate "Chapter One"
    on click "#b" navigate "Chapter One"
  ] []
}
timeline "Chapter One" in "#stage" using raf {
  at 0s..30s [ selectElement("#x") ] []
}`;
    const program = await parseDSL(source);
    const ir = await Effect.runPromise(transformAST(program));
    const navActions = ir.config.actions.filter(a => a.name?.startsWith('__nav__'));
    expect(navActions).toHaveLength(1);
    expect(navActions[0].name).toBe('__nav__chapter_one');
  });
});

describe('navigate sugar — target validation', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  const hasNavTargetError = (errors: { message: string }[]) =>
    errors.some(e => e.message.includes('Unknown navigate target'));

  test('hard-errors when the navigate target names no timeline', async () => {
    const source = `languages { * "en-US" "English" }
timeline "Hub" in "#stage" using raf {
  at 0s..30s [ on click "#card-ch1" navigate "Nonexistent" ] []
}`;
    const result = await ctx.parseAndValidate(source);
    const errors = result.diagnostics.filter(d => d.severity === DiagnosticSeverity.Error);
    expect(hasNavTargetError(errors)).toBe(true);
  });

  test('accepts a navigate target that names an existing timeline', async () => {
    const source = `languages { * "en-US" "English" }
timeline "Hub" in "#stage" using raf {
  at 0s..30s [ on click "#card-ch1" navigate "Chapter One" ] []
}
timeline "Chapter One" in "#stage" using raf {
  at 0s..30s [ selectElement("#x") ] []
}`;
    const result = await ctx.parseAndValidate(source);
    const errors = result.diagnostics.filter(d => d.severity === DiagnosticSeverity.Error);
    // Other (CSS) errors may exist, but NOT an unknown-navigate-target error.
    expect(hasNavTargetError(errors)).toBe(false);
  });
});
