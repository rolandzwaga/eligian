/**
 * "▶ Preview from 22s" CodeLenses (audit feature idea #5).
 */
import { beforeAll, describe, expect, test } from 'vitest';
import type { CodeLens } from 'vscode-languageserver';
import { createTestContext, type TestContext } from '../../__tests__/test-helpers.js';
import { type EligianCodeLensProvider, PREVIEW_AT_COMMAND } from '../eligian-code-lens-provider.js';

describe('preview CodeLenses', () => {
  let ctx: TestContext;

  const provider = () => ctx.services.Eligian.lsp.CodeLensProvider as EligianCodeLensProvider;

  beforeAll(async () => {
    ctx = createTestContext();
    // The provider reads the client settings once the configuration is ready; let that settle
    provider();
    await new Promise(resolve => setTimeout(resolve, 0));
  });

  /** `line: title -> [timelineUri, seconds]` per lens. */
  async function lenses(code: string): Promise<string[]> {
    const document = await ctx.parse(code);
    await ctx.services.shared.workspace.DocumentBuilder.build([document], { validation: false });
    const result = (await provider().provideCodeLens(document, {
      textDocument: { uri: document.uri.toString() },
    })) as CodeLens[];
    return result.map(lens => {
      expect(lens.command?.command).toBe(PREVIEW_AT_COMMAND);
      const [documentUri, timelineUri, seconds] = lens.command!.arguments!;
      expect(documentUri).toBe(document.uri.toString());
      return `${lens.range.start.line}: ${lens.command!.title} -> ${timelineUri} ${seconds}`;
    });
  }

  test('a lens per timeline, timed event, sequence item and stagger block, at the compiled times', async () => {
    const result = await lenses(`action f(x) [ selectElement("#a") ]
timeline "main" in ".c" using raf {
  at 2s..5s [ selectElement("#a") ]
  sequence {
    f(1) for 5s
    f(2) for 10s
  }
  stagger 0.3s ["#a", "#b"] with f() for 1s
}
timeline "clip" in ".v" using video from "./clip.mp4" {
  at +1s for 2s [ selectElement("#a") ]
}`);

    expect(result).toEqual([
      '1: ▶ Preview -> main 0',
      '2: ▶ Preview from 2s -> main 2',
      '4: ▶ Preview from 5s -> main 5',
      '5: ▶ Preview from 10s -> main 10',
      '7: ▶ Preview from 20s -> main 20',
      // A video timeline is switched to by its source
      '9: ▶ Preview -> ./clip.mp4 0',
      '10: ▶ Preview from 1s -> ./clip.mp4 1',
    ]);
  });

  test('no lens for an event whose time depends on a runtime value', async () => {
    const result = await lenses(`timeline "t" in ".c" using raf {
  at 0s..$globaldata.end [ selectElement("#a") ]
  at +1s..+2s [ selectElement("#a") ]
}`);
    expect(result).toEqual(['0: ▶ Preview -> t 0']);
  });

  test('the eligian.codeLens.preview setting turns the lenses off', async () => {
    provider().applySettings({ preview: false });
    try {
      expect(
        await lenses('timeline "t" in ".c" using raf { at 0s..1s [ selectElement("#a") ] }')
      ).toEqual([]);
    } finally {
      provider().applySettings({});
    }
  });
});
