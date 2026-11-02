/**
 * Attribute-name completion with the cursor in whitespace inside the
 * createElement attributes object (audit 2026-10-22, medium #28).
 */

import { EmptyFileSystem } from 'langium';
import { expectCompletion } from 'langium/test';
import { describe, expect, it } from 'vitest';
import type { CompletionList } from 'vscode-languageserver-protocol';
import { createEligianServices } from '../../eligian-module.js';

const services = createEligianServices(EmptyFileSystem).Eligian;
const completion = expectCompletion(services);

async function labelsFor(text: string): Promise<string[]> {
  let labels: string[] = [];
  await completion({
    text,
    index: 0,
    assert: (completions: CompletionList) => {
      labels = completions.items.map(item => item.label);
    },
  });
  return labels;
}

describe('createElement attribute-name completion in whitespace', () => {
  it('offers attributes for the space inside empty braces', async () => {
    const labels = await labelsFor(`
      action test [
        createElement("input", "", { <|> })
      ]
    `);
    expect(labels).toContain('type');
    expect(labels).toContain('placeholder');
  });

  it('offers attributes after a comma following a property', async () => {
    const labels = await labelsFor(`
      action test [
        createElement("input", "", { type: "text", <|> })
      ]
    `);
    expect(labels).toContain('placeholder');
  });

  it('offers attributes on a new line inside the braces', async () => {
    const labels = await labelsFor(`
      action test [
        createElement("input", "", {
          <|>
        })
      ]
    `);
    expect(labels).toContain('placeholder');
  });

  it('still offers attributes directly between the braces', async () => {
    const labels = await labelsFor(`
      action test [
        createElement("input", "", {<|>})
      ]
    `);
    expect(labels).toContain('placeholder');
  });

  it('does not offer attributes in whitespace after a closed createElement call', async () => {
    const labels = await labelsFor(`
      action test [
        createElement("input", "", { type: "text" })
        <|>
      ]
    `);
    expect(labels).not.toContain('placeholder');
  });
});
