/**
 * Signature help and parameter-name inlay hints (audit feature idea #7).
 */
import { beforeAll, describe, expect, test } from 'vitest';
import type { InlayHint, SignatureHelp } from 'vscode-languageserver';
import { createTestContext, type TestContext } from '../../__tests__/test-helpers.js';
import type { EligianInlayHintProvider } from '../eligian-inlay-hint-provider.js';

describe('signature help', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  /** Signature help at the `|` in `code`. */
  async function helpAt(code: string): Promise<SignatureHelp | undefined> {
    const offset = code.indexOf('|');
    const document = await ctx.parse(code.replace('|', ''));
    await ctx.services.shared.workspace.DocumentBuilder.build([document], { validation: false });
    return ctx.services.Eligian.lsp.SignatureHelp!.provideSignatureHelp(document, {
      textDocument: { uri: document.uri.toString() },
      position: document.textDocument.positionAt(offset),
    }) as Promise<SignatureHelp | undefined>;
  }

  const inAction = (body: string) => `action a() [ ${body} ]`;

  test('shows an operation signature from the registry, with optional parameters marked', async () => {
    const help = await helpAt(inAction('selectElement(|)'));

    const signature = help!.signatures[0];
    expect(signature.label).toBe(
      'selectElement(selector: string, useSelectedElementAsRoot?: boolean)'
    );
    expect(help!.activeParameter).toBe(0);
    const [start, end] = signature.parameters![0].label as [number, number];
    expect(signature.label.slice(start, end)).toBe('selector: string');
  });

  test('the active parameter follows the commas of the call, not those inside arguments', async () => {
    expect((await helpAt(inAction('animate({ a: 1, b: 2 }, |)')))?.activeParameter).toBe(1);
    expect((await helpAt(inAction('animate({ a: 1, |b: 2 })')))?.activeParameter).toBe(0);
    expect((await helpAt(inAction('animate({ a: 1 }, 500, "ease"|)')))?.activeParameter).toBe(2);
  });

  test('shows an action signature with its JSDoc description and @param texts', async () => {
    const help = await helpAt(`/**
 * Fades an element in.
 * @param selector The element to fade
 * @param duration Fade time in milliseconds
 */
action fadeIn(selector: string, duration) [ selectElement(selector) ]
action b() [ fadeIn("#a", |) ]`);

    const signature = help!.signatures[0];
    expect(signature.label).toBe('fadeIn(selector: string, duration)');
    expect(signature.documentation).toEqual({ kind: 'markdown', value: 'Fades an element in.' });
    expect(help!.activeParameter).toBe(1);
    expect(signature.parameters![1].documentation).toEqual({
      kind: 'markdown',
      value: '`duration` — Fade time in milliseconds',
    });
  });

  test("lists a controller's parameters after the controller name in addController", async () => {
    const help = await helpAt(inAction('selectElement("#a") addController("LabelController", |)'));

    const labels = help!.signatures[0].parameters!.map(p => {
      const [start, end] = p.label as [number, number];
      return help!.signatures[0].label.slice(start, end);
    });
    expect(labels.map(l => l.split(/[?:]/)[0])).toEqual([
      'controller',
      'translationKey',
      'attributeName',
    ]);
    expect(help!.activeParameter).toBe(1);
  });

  test('nothing outside the parentheses or for unknown names', async () => {
    expect(await helpAt(inAction('selectElement("#a")|'))).toBeUndefined();
    expect(await helpAt(inAction('|selectElement("#a")'))).toBeUndefined();
    expect(await helpAt(inAction('noSuchOperation(|)'))).toBeUndefined();
    expect(await helpAt(inAction('toString(|)'))).toBeUndefined();
  });
});

describe('parameter-name inlay hints', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  const provider = () => ctx.services.Eligian.lsp.InlayHintProvider as EligianInlayHintProvider;

  async function hintsFor(code: string, mode: 'none' | 'literals' | 'all' = 'literals') {
    const document = await ctx.parse(code);
    await ctx.services.shared.workspace.DocumentBuilder.build([document], { validation: false });
    provider().setParameterNameHints(mode);
    try {
      const hints = (await provider().getInlayHints(document, {
        textDocument: { uri: document.uri.toString() },
        range: {
          start: { line: 0, character: 0 },
          end: document.textDocument.positionAt(code.length),
        },
      })) as InlayHint[];
      // Each hint with the text that follows it
      return hints.map(
        h => `${h.label}${code.slice(document.textDocument.offsetAt(h.position)).slice(0, 6)}`
      );
    } finally {
      provider().setParameterNameHints('literals');
    }
  }

  test('literals mode: names before literal arguments only', async () => {
    expect(
      await hintsFor('action a(x) [ broadcastEvent(["#p"], "go") animate({ o: 1 }, x) wait(-5) ]')
    ).toEqual([
      'eventArgs:["#p"]',
      'eventName:"go") ',
      'animationProperties:{ o: 1',
      'milliseconds:-5) ]',
    ]);
  });

  test('all mode: every argument except a parameter passed under its own name', async () => {
    expect(
      await hintsFor(
        'action a(selector, d) [ selectElement(selector) animate({ o: 1 }, d) ]',
        'all'
      )
    ).toEqual(['animationProperties:{ o: 1', 'animationDuration:d) ]']);
  });

  test('none mode: no hints', async () => {
    expect(await hintsFor('action a() [ broadcastEvent(["#p"], "go") ]', 'none')).toEqual([]);
  });

  test('addController: no hint on the controller name, then the controller parameters', async () => {
    expect(
      await hintsFor(
        'action a() [ selectElement("#a") addController("LabelController", "nav.home") ]'
      )
    ).toEqual(['selector:"#a") ', 'translationKey:"nav.h']);
  });

  test('extra arguments and unknown names get no hints', async () => {
    expect(await hintsFor('action a() [ log("a", "b", "c") nope("x") ]')).toEqual([
      'logValue:"a", "',
      'logName:"b", "',
    ]);
  });
});
