/**
 * Duplicate-name validation for timelines and event actions.
 *
 * Regression tests for the audit finding "No duplicate-name validation for
 * timelines or event actions, and event actions can collide with actions or
 * operations": duplicate `timeline "t"` blocks (which make `navigate "t"` and
 * the Eligius timeline URIs ambiguous), duplicate event action names, event
 * actions named like a regular action, and event actions named like a
 * built-in operation all validated without any diagnostic.
 */
import { beforeAll, describe, expect, test } from 'vitest';
import { createTestContext, DiagnosticSeverity, type TestContext } from './test-helpers.js';

describe('Duplicate timelines and event action names', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  async function diagnosticsWithCode(code: string, diagnosticCode: string) {
    const { document, diagnostics } = await ctx.parseAndValidate(code);
    expect(document.parseResult.parserErrors).toEqual([]);
    return diagnostics.filter(d => d.code === diagnosticCode || d.data?.code === diagnosticCode);
  }

  const timeline = (name: string) => `
    timeline "${name}" in "#app" using raf {
      at 0s..1s noop()
    }
  `;

  const header = `action noop() [ log("x") ]`;

  describe('timelines', () => {
    test('reports every timeline after the first with the same name', async () => {
      const found = await diagnosticsWithCode(
        `${header} ${timeline('t')} ${timeline('t')} ${timeline('t')}`,
        'duplicate_timeline'
      );
      expect(found).toHaveLength(2);
      expect(found.every(d => d.severity === DiagnosticSeverity.Error)).toBe(true);
      expect(found[0].message).toContain("'t'");
    });

    test('accepts distinct timeline names', async () => {
      const found = await diagnosticsWithCode(
        `${header} ${timeline('a')} ${timeline('b')}`,
        'duplicate_timeline'
      );
      expect(found).toEqual([]);
    });
  });

  describe('event actions', () => {
    test('reports a duplicate event action name', async () => {
      const found = await diagnosticsWithCode(
        `
          ${header}
          on event "language-change" action foo(l) [ log(l) ]
          on event "dom-mutation" action foo() [ log("y") ]
          ${timeline('t')}
        `,
        'duplicate_event_action'
      );
      expect(found).toHaveLength(1);
      expect(found[0].severity).toBe(DiagnosticSeverity.Error);
      expect(found[0].message).toContain("'foo'");
    });

    test('warns when an event action has the same name as an action', async () => {
      const found = await diagnosticsWithCode(
        `
          ${header}
          action foo() [ log("x") ]
          on event "language-change" action foo(l) [ log(l) ]
          ${timeline('t')}
        `,
        'event_action_name_conflict'
      );
      expect(found).toHaveLength(1);
      expect(found[0].severity).toBe(DiagnosticSeverity.Warning);
      expect(found[0].message).toContain("'foo'");
    });

    test('warns when an event action has the same name as an endable action', async () => {
      const found = await diagnosticsWithCode(
        `
          ${header}
          endable action foo() [ log("x") ] [ log("y") ]
          on event "language-change" action foo(l) [ log(l) ]
          ${timeline('t')}
        `,
        'event_action_name_conflict'
      );
      expect(found).toHaveLength(1);
    });

    test('warns when an event action is named like a built-in operation', async () => {
      const found = await diagnosticsWithCode(
        `
          ${header}
          on event "language-change" action selectElement(l) [ log(l) ]
          ${timeline('t')}
        `,
        'event_action_name_builtin_conflict'
      );
      expect(found).toHaveLength(1);
      expect(found[0].severity).toBe(DiagnosticSeverity.Warning);
    });

    test('accepts distinct event action names', async () => {
      const code = `
        ${header}
        on event "language-change" action a(l) [ log(l) ]
        on event "dom-mutation" action b() [ log("y") ]
        ${timeline('t')}
      `;
      for (const diagnosticCode of [
        'duplicate_event_action',
        'event_action_name_conflict',
        'event_action_name_builtin_conflict',
      ]) {
        expect(await diagnosticsWithCode(code, diagnosticCode)).toEqual([]);
      }
    });
  });
});
