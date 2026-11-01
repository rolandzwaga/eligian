/**
 * Readable syntax errors (EligianParserErrorMessageProvider): no 50-line
 * token lists, keywords used as names explained, tokens in words.
 */
import { beforeAll, describe, expect, test } from 'vitest';
import { createTestContext, type TestContext } from './test-helpers.js';

describe('parser error messages', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  const messages = async (source: string) =>
    (await ctx.parse(source)).parseResult.parserErrors.map(e => e.message);

  test.each([
    [
      'action loop(selector) [ selectElement(selector) ]',
      "'loop' is a keyword, so it cannot be used as a name here. Choose another name.",
    ],
    ['const = 5', "Expected a name here, but found '='."],
    [
      'on event "x" action Foo(if) [ selectElement("#a") ]',
      "Expected ')' here, but found 'if' ('if' is a keyword and cannot be used as a name).",
    ],
    [
      'timeline "t" in "#s" using raf { at 0s..1s }',
      "Expected an action or operation call, or a [ … ] block here, but found '}'.",
    ],
    [
      'timeline "t" in "#s" using raf { at 0s.. [ ] [ ] }',
      "Expected a time (such as 2s, +1s, @beat or intro.end) here, but found '['.",
    ],
    [
      'timeline "t" in "#s" using raf { foo }',
      "Expected an event (at, sequence, stagger), on enter / on leave, or '}' here, but found 'foo'.",
    ],
    ['timeline "t" using raf { }', "Expected 'in' here, but found 'using'."],
    [
      'timeline "t" in "#s" using banana { }',
      "Expected 'video', 'audio', 'raf', 'scroll' or 'custom' here, but found 'banana'.",
    ],
    ['action a() [ selectElement("#a" ]', "Expected ')' here, but found ']'."],
    ['action a() [ selectElement("#a") ', "Expected ']' here, but found the end of the file."],
    ['action a() [ on click navigate "x" ]', "Expected a string here, but found 'navigate'."],
  ])('%s', async (source, message) => {
    expect((await messages(source))[0]).toBe(message);
  });

  test('a message is one line, never a list of token sequences', async () => {
    for (const source of ['action loop() [ ]', 'const = 5', 'action a() [ at ]', 'timeline 5']) {
      for (const message of await messages(source)) {
        expect(message).not.toContain('\n');
        expect(message.length).toBeLessThan(200);
      }
    }
  });
});
