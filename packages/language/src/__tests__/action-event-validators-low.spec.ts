/**
 * Regressions from the 2026-10-22 codebase audit (low findings):
 * - control-flow pairing must also inspect if/for bodies
 * - recursive-call detection must report one cycle once per cycle member
 * - partial-AST handling (empty languages block, missing event name, navigate
 *   without a target) must not emit contradictory follow-on diagnostics
 */

import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import type { Diagnostic } from 'vscode-languageserver-protocol';
import {
  CSS_FIXTURES,
  createTestContext,
  DiagnosticSeverity,
  setupCSSRegistry,
  type TestContext,
} from './test-helpers.js';

function codeOf(d: Diagnostic): unknown {
  return d.code ?? (d.data as any)?.code;
}

function errors(diagnostics: Diagnostic[]): Diagnostic[] {
  return diagnostics.filter(d => d.severity === DiagnosticSeverity.Error);
}

function withCode(diagnostics: Diagnostic[], code: string): Diagnostic[] {
  return diagnostics.filter(d => codeOf(d) === code);
}

/** Diagnostics that come from the control-flow pairing check. */
function controlFlow(diagnostics: Diagnostic[]): Diagnostic[] {
  return errors(diagnostics).filter(d => codeOf(d) === 'control_flow');
}

const TIMELINE = 'timeline "t" in "#container" using raf {}';

describe('action/event validators: low audit findings', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  beforeEach(() => {
    setupCSSRegistry(ctx, 'file:///styles.css', CSS_FIXTURES.common);
  });

  describe('#12 control-flow pairing inside nested blocks', () => {
    test('top-level unclosed when is still reported (baseline)', async () => {
      const { diagnostics } = await ctx.parseAndValidate(`
        action q2() [ when(@@currentItem) ]
        ${TIMELINE}
      `);
      const found = controlFlow(diagnostics);
      expect(found).toHaveLength(1);
      expect(found[0].message).toContain("Unclosed 'when'");
    });

    test('unclosed raw when inside an if body is reported on the if', async () => {
      const code = `
        action q() [
          if (true) {
            when(@@currentItem)
          }
        ]
        ${TIMELINE}
      `;
      const { diagnostics } = await ctx.parseAndValidate(code);
      const found = controlFlow(diagnostics);
      expect(found).toHaveLength(1);
      expect(found[0].message).toContain("Unclosed 'when'");
      // Reported on the nested block, not on the action header
      expect(found[0].range.start.line).toBe(
        code.split('\n').findIndex(l => l.includes('when(@@currentItem)'))
      );
    });

    test('unclosed raw when inside an else branch is reported', async () => {
      const { diagnostics } = await ctx.parseAndValidate(`
        action q() [
          if (true) {
            selectElement("#a")
          } else {
            when(@@currentItem)
          }
        ]
        ${TIMELINE}
      `);
      expect(controlFlow(diagnostics)).toHaveLength(1);
    });

    test('unclosed raw forEach inside a for body is reported', async () => {
      const { diagnostics } = await ctx.parseAndValidate(`
        action q() [
          for (item in @@currentItem) {
            forEach(@@currentItem)
          }
        ]
        ${TIMELINE}
      `);
      const found = controlFlow(diagnostics);
      expect(found).toHaveLength(1);
      expect(found[0].message).toContain("Unclosed 'forEach'");
    });

    test('unmatched endWhen inside a nested block is reported', async () => {
      const { diagnostics } = await ctx.parseAndValidate(`
        action q() [
          if (true) {
            endWhen()
          }
        ]
        ${TIMELINE}
      `);
      const found = controlFlow(diagnostics);
      expect(found).toHaveLength(1);
      expect(found[0].message).toContain("Unmatched 'endWhen'");
    });

    test('a when at top level does not pair with an endWhen inside an if body', async () => {
      const { diagnostics } = await ctx.parseAndValidate(`
        action q() [
          when(@@currentItem)
          if (true) {
            endWhen()
          }
        ]
        ${TIMELINE}
      `);
      // top-level when is unclosed + nested endWhen is unmatched
      expect(controlFlow(diagnostics)).toHaveLength(2);
    });

    test('balanced raw when/endWhen inside a nested block is accepted', async () => {
      const { diagnostics } = await ctx.parseAndValidate(`
        action q() [
          if (true) {
            when(@@currentItem)
            selectElement("#a")
            endWhen()
          }
        ]
        ${TIMELINE}
      `);
      expect(controlFlow(diagnostics)).toHaveLength(0);
    });

    test('endable action start operations also check nested blocks', async () => {
      const { diagnostics } = await ctx.parseAndValidate(`
        endable action e() [
          if (true) {
            when(@@currentItem)
          }
        ] [
          selectElement("#a")
        ]
        ${TIMELINE}
      `);
      expect(controlFlow(diagnostics)).toHaveLength(1);
    });

    test('event action body also checks nested blocks', async () => {
      const { diagnostics } = await ctx.parseAndValidate(`
        on event "timeline-complete" action handler() [
          if (true) {
            when(@@currentItem)
          }
        ]
        ${TIMELINE}
      `);
      expect(controlFlow(diagnostics)).toHaveLength(1);
    });
  });

  describe('#15 a cycle is reported once per cycle member', () => {
    test('a -> b -> c -> b reports b and c once each, and not a', async () => {
      const code = `
        action a() [ b() ]
        action b() [ c() ]
        action c() [ b() ]
        ${TIMELINE}
      `;
      const { diagnostics } = await ctx.parseAndValidate(code);
      const rec = withCode(diagnostics, 'recursive_action_call');
      expect(rec).toHaveLength(2);
      // exactly one per call site: no duplicates on the same node
      const lines = rec.map(d => `${d.range.start.line}:${d.range.start.character}`);
      expect(new Set(lines).size).toBe(2);
      // the upstream `a() [ b() ]` call site is not reported
      const aLine = code.split('\n').findIndex(l => l.includes('action a()'));
      expect(rec.some(d => d.range.start.line === aLine)).toBe(false);
    });
  });

  describe('#16 partial-AST diagnostics', () => {
    test('empty languages block yields only the empty-block error', async () => {
      const { diagnostics } = await ctx.parseAndValidate(`
        languages { }
        ${TIMELINE}
      `);
      expect(withCode(diagnostics, 'missing_default_marker')).toHaveLength(0);
      expect(diagnostics.some(d => d.message.includes('exactly one * marker'))).toBe(false);
    });

    test('multiple languages without a default marker still error', async () => {
      const { diagnostics } = await ctx.parseAndValidate(`
        languages {
          "en-US" "English"
          "nl-NL" "Nederlands"
        }
        ${TIMELINE}
      `);
      expect(withCode(diagnostics, 'missing_default_marker')).toHaveLength(1);
    });

    test('missing event name produces exactly one event-name diagnostic', async () => {
      const { diagnostics } = await ctx.parseAndValidate(`
        on event action foo() [
          selectElement("#a")
        ]
        ${TIMELINE}
      `);
      const nameDiagnostics = diagnostics.filter(
        d =>
          d.message.toLowerCase().includes('event name') ||
          codeOf(d) === 'empty_event_name' ||
          codeOf(d) === 'event_name_must_be_literal'
      );
      expect(nameDiagnostics).toHaveLength(1);
      expect(codeOf(nameDiagnostics[0])).toBe('event_name_must_be_literal');
      expect(diagnostics.some(d => d.message.includes('variable reference'))).toBe(false);
      expect(diagnostics.some(d => d.message === 'Event name cannot be empty')).toBe(false);
    });

    test('empty-string event name is reported once, without the variable-reference text', async () => {
      const { diagnostics } = await ctx.parseAndValidate(`
        on event "" action foo() [
          selectElement("#a")
        ]
        ${TIMELINE}
      `);
      expect(withCode(diagnostics, 'empty_event_name')).toHaveLength(1);
      expect(diagnostics.some(d => d.message.includes('variable reference'))).toBe(false);
    });

    test('over-long event name still reports the length error', async () => {
      const longName = 'x'.repeat(101);
      const { diagnostics } = await ctx.parseAndValidate(`
        on event "${longName}" action foo() [
          selectElement("#a")
        ]
        ${TIMELINE}
      `);
      expect(withCode(diagnostics, 'event_name_too_long')).toHaveLength(1);
    });

    test('navigate without a target does not report target "undefined"', async () => {
      const { diagnostics } = await ctx.parseAndValidate(`
        timeline "t" in "#container" using raf {
          at 0s..5s [
            on click "#a" navigate
          ] []
        }
      `);
      expect(diagnostics.some(d => d.message.includes("'undefined'"))).toBe(false);
      expect(diagnostics.some(d => d.message.includes('Unknown navigate target'))).toBe(false);
    });

    test('navigate to an unknown timeline is still an error', async () => {
      const { diagnostics } = await ctx.parseAndValidate(`
        timeline "t" in "#container" using raf {
          at 0s..5s [
            on click "#a" navigate "nope"
          ] []
        }
      `);
      expect(diagnostics.some(d => d.message.includes("Unknown navigate target: 'nope'"))).toBe(
        true
      );
    });
  });
});
