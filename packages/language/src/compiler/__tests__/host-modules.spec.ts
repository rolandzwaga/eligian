/**
 * Host modules (audit idea #24): `extensions "./host.ts" { … }` declares
 * custom operations, controllers and functions; they are validated,
 * completed and compiled like Eligius' own.
 */
import { Effect } from 'effect';
import { EmptyFileSystem } from 'langium';
import { expectCompletion, parseHelper } from 'langium/test';
import { beforeAll, describe, expect, test } from 'vitest';
import type { CompletionList } from 'vscode-languageserver-protocol';
import {
  createTestContext,
  DiagnosticSeverity,
  type TestContext,
} from '../../__tests__/test-helpers.js';
import { createEligianServices } from '../../eligian-module.js';
import type { Program } from '../../generated/ast.js';
import { transformAST } from '../ast-transformer.js';
import { hostModuleOf } from '../operations/host-operations.js';

const EXTENSIONS = `extensions "./host.ts" {
  operation trackEvent(eventName: string, data?: object)
  operation note(value)
  controller Confetti(count: number)
  function formatPrice
}`;

describe('host modules (idea #24)', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  const diagnostics = async (source: string) => {
    const { document, diagnostics } = await ctx.parseAndValidate(source);
    expect(document.parseResult.parserErrors).toEqual([]);
    return diagnostics
      .filter(d => !String((d.data as { code?: string })?.code ?? d.code).startsWith('unknown_css'))
      .map(d => `${d.severity === DiagnosticSeverity.Error ? 'error' : 'warning'}: ${d.message}`);
  };

  test('host operations, controllers and functions are known and checked', async () => {
    expect(
      await diagnostics(`${EXTENSIONS}
action intro() [
  trackEvent("intro", { page: 1 })
  note(5) note("x")
  selectElement("#a") addController("Confetti", 3)
  customFunction("formatPrice")
]
timeline "t" in "#a" using raf { at 0s..1s intro() }`)
    ).toEqual([]);
    expect(
      await diagnostics(`${EXTENSIONS}
action intro() [ trackEvent(5) trackEvent() selectElement("#a") addController("Confetti") customFunction("nope") ]
timeline "t" in "#a" using raf { at 0s..1s intro() }`)
    ).toEqual([
      "error: Parameter 'eventName' expects type 'ParameterType:string' but got 'number'. Provide a ParameterType:string value for parameter 'eventName'",
      'error: Operation "trackEvent" expects 1-2 parameter(s), but got 0. Expected: trackEvent(eventName, [data])',
      "error: Missing required parameter 'count' for controller 'Confetti'.",
      "warning: Unknown function 'nope': the extensions import declares 'formatPrice'",
    ]);
  });

  test('without the declaration a host operation is unknown', async () => {
    const messages = await diagnostics(
      'action intro() [ trackEvent("intro") ]\ntimeline "t" in "#a" using raf { at 0s..1s intro() }'
    );
    expect(
      messages.some(m => m.includes("Unknown operation 'trackEvent'") || m.includes('trackEvent'))
    ).toBe(true);
  });

  test('the declarations: no Eligius names, no duplicates, a relative module, one import', async () => {
    expect(
      await diagnostics(`extensions "host.ts" {
  operation addClass()
  operation a(x, x)
  operation a()
  controller LabelController()
}
extensions "./other.css" { }
timeline "t" in "#a" using raf { at 0s..1s [ selectElement("#a") ] [] }`)
    ).toEqual([
      'error: A program has one extensions import; declare everything in the first one',
      'error: The extensions module path must be relative ("./host.ts")',
      "error: 'addClass' is an Eligius operation: a host operation needs another name",
      "error: Duplicate parameter 'x'",
      "error: Duplicate host operation 'a'",
      "error: 'LabelController' is an Eligius controller: a host controller needs another name",
      'error: The extensions module must be a .js, .mjs, .ts, .mts, .jsx or .tsx file',
    ]);
  });

  test('an action may not have the name of a host operation', async () => {
    const messages = await diagnostics(`${EXTENSIONS}
action note() [ selectElement("#a") ]
timeline "t" in "#a" using raf { at 0s..1s note() }`);
    expect(messages.some(m => m.startsWith('error:') && m.includes('note'))).toBe(true);
  });

  test('completion offers host operations and controllers', async () => {
    const labelsAt = async (text: string) => {
      let labels: string[] = [];
      await expectCompletion(ctx.services.Eligian)({
        text,
        index: 0,
        assert: (completions: CompletionList) => {
          labels = completions.items.map(i => i.label);
        },
      });
      return labels;
    };
    expect(await labelsAt(`${EXTENSIONS}\naction a() [ <|> ]`)).toEqual(
      expect.arrayContaining(['trackEvent (host operation)', 'note (host operation)'])
    );
    expect(await labelsAt(`${EXTENSIONS}\naction a() [ addController(<|>) ]`)).toEqual(
      expect.arrayContaining(['Confetti', 'LabelController'])
    );
  });

  test('signature help shows a host operation', async () => {
    const source = `${EXTENSIONS}\naction a() [ trackEvent("x", ) ]`;
    const document = await ctx.parse(source);
    const help = await ctx.services.Eligian.lsp.SignatureHelp?.provideSignatureHelp(document, {
      textDocument: { uri: document.uri.toString() },
      position: document.textDocument.positionAt(source.indexOf('", )') + 3),
    });
    expect(help?.signatures[0].label).toContain('trackEvent(eventName: string, data?: object)');
  });
});

describe('host modules: compilation (idea #24)', () => {
  let parse: ReturnType<typeof parseHelper<Program>>;

  beforeAll(() => {
    parse = parseHelper<Program>(createEligianServices(EmptyFileSystem).Eligian);
  });

  test('a host operation compiles like an Eligius one, a controller through getControllerInstance', async () => {
    const document = await parse(`${EXTENSIONS}
timeline "t" in "#a" using raf {
  at 0s..1s [ trackEvent("intro", { page: 1 }) note(2) selectElement("#a") addController("Confetti", 3) ] []
}`);
    const ir = await Effect.runPromise(transformAST(document.parseResult.value));
    expect(
      ir.config.timelines[0].timelineActions[0].startOperations.map(o => [
        o.systemName,
        o.operationData,
      ])
    ).toEqual([
      ['trackEvent', { eventName: 'intro', data: { page: 1 } }],
      ['note', { value: 2 }],
      ['selectElement', { selector: '#a' }],
      ['getControllerInstance', { systemName: 'Confetti' }],
      ['addControllerToElement', { count: 3 }],
    ]);
    expect(hostModuleOf(document.parseResult.value)).toEqual({
      path: './host.ts',
      operations: ['trackEvent', 'note'],
      controllers: ['Confetti'],
      functions: ['formatPrice'],
    });
  });
});
