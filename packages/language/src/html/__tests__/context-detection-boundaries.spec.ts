/**
 * detectHTMLCompletionContext string/object boundary handling
 * (audit 2026-10-22, low #29, #31, #35).
 */

import { beforeAll, describe, expect, test } from 'vitest';
import { createTestContext, type TestContext } from '../../__tests__/test-helpers.js';
import { detectHTMLCompletionContext } from '../context-detection.js';
import { HTMLCompletionContextType } from '../context-types.js';

describe('detectHTMLCompletionContext boundaries', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  /** The `|` character marks the cursor. */
  async function detect(code: string) {
    const offset = code.indexOf('|');
    const source = code.replace('|', '');
    const document = await ctx.parse(source);
    return detectHTMLCompletionContext({
      document,
      offset,
      textDocument: document.textDocument,
      node: document.parseResult.value,
    } as any);
  }

  const wrap = (call: string) => `action test [\n  ${call}\n]`;

  test('cursor on the opening quote is not inside the string (#31)', async () => {
    const result = await detect(wrap('createElement(|"div")'));
    expect(result.type).toBe(HTMLCompletionContextType.None);
  });

  test('cursor right after the closing quote is not inside the string (#29)', async () => {
    const result = await detect(wrap('createElement("div"|)'));
    expect(result.type).toBe(HTMLCompletionContextType.None);
  });

  test('cursor inside the quotes reports the typed prefix and bounds (#29)', async () => {
    const result = await detect(wrap('createElement("di|v")'));
    expect(result.type).toBe(HTMLCompletionContextType.ElementName);
    expect(result.partialText).toBe('di');
    expect(result.stringContentEnd! - result.stringContentStart!).toBe(3);
  });

  test('cursor at the very end of the string content is inside it', async () => {
    const result = await detect(wrap('createElement("div|")'));
    expect(result.type).toBe(HTMLCompletionContextType.ElementName);
    expect(result.partialText).toBe('div');
  });

  test('single-quoted strings behave the same (#29, #31)', async () => {
    expect((await detect(wrap("createElement(|'div')"))).type).toBe(HTMLCompletionContextType.None);
    expect((await detect(wrap("createElement('di|v')"))).partialText).toBe('di');
  });

  test('cursor right after the closing brace is outside the object (#29)', async () => {
    const result = await detect(wrap('createElement("input", "x", {}|)'));
    expect(result.type).toBe(HTMLCompletionContextType.None);
  });

  test('cursor between empty braces is an attribute-name context (#29)', async () => {
    const result = await detect(wrap('createElement("input", "x", {|})'));
    expect(result.type).toBe(HTMLCompletionContextType.AttributeName);
    expect(result.elementName).toBe('input');
  });

  test('cursor right after an unterminated `{` is an attribute-name context', async () => {
    const result = await detect('action a() [ createElement("div", "", {|');
    expect(result.type).toBe(HTMLCompletionContextType.AttributeName);
    expect(result.elementName).toBe('div');
  });

  test('cursor after a trailing comma in an unterminated object is an attribute-name context', async () => {
    const result = await detect('action a() [ createElement("div", "", { class: "x",|');
    expect(result.type).toBe(HTMLCompletionContextType.AttributeName);
    expect(result.elementName).toBe('div');
  });

  test('cursor after a closed attribute value string is not an attribute value (#29)', async () => {
    const result = await detect(wrap('createElement("input", "", { type: "text"| })'));
    expect(result.type).toBe(HTMLCompletionContextType.None);
  });

  test('cursor inside an attribute value string reports the prefix (#29)', async () => {
    const result = await detect(wrap('createElement("input", "", { type: "te|xt" })'));
    expect(result.type).toBe(HTMLCompletionContextType.AttributeValue);
    expect(result.attributeName).toBe('type');
    expect(result.partialText).toBe('te');
  });

  test('cursor inside a string key is an attribute-name context with bounds (#35)', async () => {
    const result = await detect(wrap('createElement("input", "", { "aria-|": 1 })'));
    expect(result.type).toBe(HTMLCompletionContextType.AttributeName);
    expect(result.elementName).toBe('input');
    expect(result.partialText).toBe('aria-');
    expect(result.stringContentEnd).toBeGreaterThan(result.stringContentStart!);
  });

  test('cursor inside an empty string key is an attribute-name context (#35)', async () => {
    const result = await detect(wrap('createElement("input", "", { "|": 1 })'));
    expect(result.type).toBe(HTMLCompletionContextType.AttributeName);
    expect(result.partialText).toBe('');
  });

  test('cursor on a value after a string key is an attribute value (#35)', async () => {
    const result = await detect(wrap('createElement("input", "", { "type": "ch|" })'));
    expect(result.type).toBe(HTMLCompletionContextType.AttributeValue);
    expect(result.attributeName).toBe('type');
    expect(result.partialText).toBe('ch');
  });

  test('cursor after the opening paren of an empty call offers an element name', async () => {
    const result = await detect(wrap('createElement(|)'));
    expect(result.type).toBe(HTMLCompletionContextType.ElementName);
    expect(result.stringContentStart).toBeUndefined();
  });
});
