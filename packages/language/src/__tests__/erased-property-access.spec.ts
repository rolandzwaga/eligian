/**
 * `erased-property-access` diagnostic (audit 2026-10-22, low finding #28).
 *
 * The OperationDataTracker never recorded erasures, so the validators' branch
 * reporting "Property 'x' is not available - it was erased by operation 'y'"
 * was unreachable: every missing dependency was reported as
 * `missing-dependency` ("ensure it is created by a previous operation").
 *
 * No real operation currently erases a property another operation depends on
 * (dependencies such as selectedElement are never erased, by design), so the
 * `log` signature is given a temporary `template` dependency here:
 * createElement outputs `template`, setElementContent erases it.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import type { Diagnostic } from 'vscode-languageserver-protocol';
import { OPERATION_REGISTRY } from '../compiler/operations/index.js';
import {
  CSS_FIXTURES,
  createTestContext,
  DiagnosticSeverity,
  setupCSSRegistry,
  type TestContext,
} from './test-helpers.js';

function errorsWithCode(diagnostics: Diagnostic[] | undefined, code: string): Diagnostic[] {
  return (diagnostics ?? []).filter(
    d => d.severity === DiagnosticSeverity.Error && (d.code ?? (d.data as any)?.code) === code
  );
}

describe('erased-property-access diagnostic (audit #28)', () => {
  let ctx: TestContext;
  const originalLog = OPERATION_REGISTRY.log;

  beforeAll(() => {
    ctx = createTestContext();
    OPERATION_REGISTRY.log = {
      ...originalLog,
      dependencies: [
        ...originalLog.dependencies,
        { name: 'template', type: 'ParameterType:object' },
      ],
    };
  });

  afterAll(() => {
    OPERATION_REGISTRY.log = originalLog;
  });

  beforeEach(() => {
    setupCSSRegistry(ctx, 'file:///styles.css', CSS_FIXTURES.common);
  });

  test('a dependency erased by a previous operation is reported as erased (action)', async () => {
    const { diagnostics } = await ctx.parseAndValidate(`
      styles "./styles.css"
      action t [
        selectElement("#a")
        createElement("div")
        setElementContent("hello")
        log()
      ]
      timeline "t" in "#container" using raf {}
    `);

    const erased = errorsWithCode(diagnostics, 'erased-property-access');
    expect(erased.map(d => d.message)).toEqual([
      "Property 'template' is not available - it was erased by operation 'setElementContent'",
    ]);
    expect(errorsWithCode(diagnostics, 'missing-dependency')).toHaveLength(0);
  });

  test('a dependency erased by a previous operation is reported as erased (event action)', async () => {
    const { diagnostics } = await ctx.parseAndValidate(`
      styles "./styles.css"
      on event "go" action onGo [
        selectElement("#a")
        createElement("div")
        setElementContent("hello")
        log()
      ]
      timeline "t" in "#container" using raf {}
    `);

    expect(errorsWithCode(diagnostics, 'erased-property-access')).toHaveLength(1);
  });

  test('an erasure in one if/else branch is reported after the join', async () => {
    const { diagnostics } = await ctx.parseAndValidate(`
      styles "./styles.css"
      action t [
        selectElement("#a")
        createElement("div")
        if (@@currentItem) {
          setElementContent("hello")
        }
        log()
      ]
      timeline "t" in "#container" using raf {}
    `);

    expect(errorsWithCode(diagnostics, 'erased-property-access').map(d => d.message)).toEqual([
      "Property 'template' is not available - it was erased by operation 'setElementContent'",
    ]);
  });

  test('no error while the dependency is still available', async () => {
    const { diagnostics } = await ctx.parseAndValidate(`
      styles "./styles.css"
      action t [
        selectElement("#a")
        createElement("div")
        log()
        setElementContent("hello")
      ]
      timeline "t" in "#container" using raf {}
    `);

    expect(errorsWithCode(diagnostics, 'erased-property-access')).toHaveLength(0);
    expect(errorsWithCode(diagnostics, 'missing-dependency')).toHaveLength(0);
  });

  test('a dependency that was never created is still missing-dependency', async () => {
    const { diagnostics } = await ctx.parseAndValidate(`
      styles "./styles.css"
      action t [
        selectElement("#a")
        log()
      ]
      timeline "t" in "#container" using raf {}
    `);

    expect(errorsWithCode(diagnostics, 'erased-property-access')).toHaveLength(0);
    expect(errorsWithCode(diagnostics, 'missing-dependency').map(d => d.message)).toEqual([
      "Property 'template' is not available - ensure it is created by a previous operation",
    ]);
  });
});
