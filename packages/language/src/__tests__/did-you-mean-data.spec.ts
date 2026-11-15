/**
 * Suggestions as data (spec 058, phase 1: FR-014, FR-045, SC-006).
 *
 * The four diagnostics below carry their "Did you mean" list in the message.
 * The first test pins the messages byte for byte (a snapshot taken before
 * `data.suggestions` was added); the second asserts that the same list is
 * also on `diagnostic.data.suggestions`.
 */

import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Diagnostic } from 'vscode-languageserver-types';
import {
  createTestContext,
  minimalProgram,
  setupCSSRegistry,
  type TestContext,
} from './test-helpers.js';

const CASES = [
  { code: 'unknown_operation', actionBody: 'adClass("x")' },
  { code: 'unknown_css_class', actionBody: 'addClass("buttn")' },
  { code: 'unknown_css_class_in_selector', actionBody: 'selectElement(".buttn")' },
  { code: 'unknown_css_id_in_selector', actionBody: 'selectElement("#headr")' },
] as const;

const codeOf = (diagnostic: Diagnostic): unknown =>
  (diagnostic.data as { code?: unknown } | undefined)?.code ?? diagnostic.code;

const suggestionsInMessage = (message: string): string[] =>
  /Did you mean: ([^?]+)\?/.exec(message)?.[1]?.split(', ') ?? [];

describe('suggestions as data', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  beforeEach(() => {
    setupCSSRegistry(ctx, 'file:///styles.css', {
      classes: ['button', 'active', 'container'],
      ids: ['header', 'element'],
    });
  });

  async function diagnosticFor(code: string, actionBody: string): Promise<Diagnostic> {
    const { diagnostics } = await ctx.parseAndValidate(minimalProgram({ actionBody }));
    const matching = diagnostics.filter(d => codeOf(d) === code);
    expect(matching, `${code} diagnostics`).toHaveLength(1);
    return matching[0];
  }

  it('messages are unchanged', async () => {
    const list: { code: string; message: string }[] = [];
    for (const { code, actionBody } of CASES) {
      const diagnostic = await diagnosticFor(code, actionBody);
      list.push({ code, message: diagnostic.message });
    }
    await expect(JSON.stringify(list, null, 2)).toMatchFileSnapshot(
      './__snapshots__/did-you-mean-messages.json.snap'
    );
  });

  it("data.suggestions equals the message's list", async () => {
    for (const { code, actionBody } of CASES) {
      const diagnostic = await diagnosticFor(code, actionBody);
      const names = suggestionsInMessage(diagnostic.message);
      expect(names.length, `${code} message suggestions`).toBeGreaterThan(0);
      expect((diagnostic.data as { suggestions?: unknown } | undefined)?.suggestions).toEqual(
        names
      );
    }
  });
});
