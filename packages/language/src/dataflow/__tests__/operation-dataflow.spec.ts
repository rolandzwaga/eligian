/**
 * Operation-data dataflow with inferred action contracts (spec 047).
 *
 * Regular actions may rely on their caller's operationData: their unmet
 * dependencies become an inferred contract, checked where the action is
 * entered with a known starting state (timelines, event actions, controllers).
 * Each case also compiles, so the editor and the compiler agree.
 */
import { Effect } from 'effect';
import { beforeAll, describe, expect, test } from 'vitest';
import type { Diagnostic } from 'vscode-languageserver-protocol';
import {
  createTestContext,
  createTestContextWithMockFS,
  DiagnosticSeverity,
  hoverContentsText,
  setupDocuments,
  type TestContext,
} from '../../__tests__/test-helpers.js';
import { transformAST } from '../../compiler/ast-transformer.js';
import { createEligianServices } from '../../eligian-module.js';
import type { ActionDefinition, Program } from '../../generated/ast.js';
import { createDataflow } from '../../validators/dataflow-validator.js';

const CODES = new Set([
  'missing-dependency',
  'missing-action-dependency',
  'erased-property-access',
]);

function codeOf(d: Diagnostic): unknown {
  return d.code ?? (d.data as { code?: unknown } | undefined)?.code;
}

describe('operation-data dataflow (spec 047)', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  const timeline = (body: string) => `timeline "t" in ".c" using raf { ${body} }`;

  /** Dataflow errors as [code, highlighted text, message], plus the compile result. */
  async function check(code: string) {
    const { diagnostics, document, program } = await ctx.parseAndValidate(code);
    expect(document.parseResult.parserErrors).toHaveLength(0);
    const errors = diagnostics
      .filter(d => d.severity === DiagnosticSeverity.Error && CODES.has(String(codeOf(d))))
      .map(d => ({
        code: codeOf(d),
        text: document.textDocument.getText(d.range),
        message: d.message,
      }));
    const compiled = await Effect.runPromise(Effect.result(transformAST(program)));
    // The compiler fails exactly when the editor reports a dataflow error, with its first message
    if (errors.length === 0) {
      expect(compiled._tag).toBe('Success');
    } else {
      expect(compiled._tag).toBe('Failure');
      if (compiled._tag === 'Failure') {
        expect(errors.map(e => e.message)).toContain(compiled.failure.message);
      }
    }
    return { errors, program };
  }

  describe('called actions inherit the caller state', () => {
    test('an action that needs selectedElement is fine after the caller selects', async () => {
      const { errors } = await check(`
        action highlight() [ addClass("on") ]
        action show() [ selectElement("#a") highlight() ]
        ${timeline('at 0s..1s show()')}
      `);
      expect(errors).toEqual([]);
    });

    test('the requirement is reported where the timeline starts the action', async () => {
      const { errors } = await check(`
        action highlight() [ addClass("on") ]
        ${timeline('at 0s..1s highlight()')}
      `);
      expect(errors).toEqual([
        {
          code: 'missing-action-dependency',
          text: 'highlight',
          message:
            "Action 'highlight' requires 'selectedElement' (used by addClass in 'highlight'), which is not available here - ensure it is created before calling 'highlight' (for example with selectElement)",
        },
      ]);
    });

    test('requirements propagate through intermediate actions', async () => {
      const { errors } = await check(`
        action highlight() [ addClass("on") ]
        action outer() [ log("x") highlight() ]
        ${timeline('at 0s..1s outer()')}
      `);
      expect(errors).toHaveLength(1);
      expect(errors[0].text).toBe('outer');
      expect(errors[0].message).toContain(
        "Action 'outer' requires 'selectedElement' (used by addClass in 'highlight')"
      );
    });

    test('an inline timeline block can provide what the called action needs', async () => {
      const { errors } = await check(`
        action highlight() [ addClass("on") ]
        ${timeline('at 0s..1s [ selectElement("#a") highlight() ] []')}
      `);
      expect(errors).toEqual([]);
    });

    test("a called action's outputs do not flow back to the caller", async () => {
      const { errors } = await check(`
        action pick() [ selectElement("#a") ]
        ${timeline('at 0s..1s [ pick() addClass("on") ] []')}
      `);
      expect(errors.map(e => [e.code, e.text])).toEqual([['missing-dependency', 'addClass']]);
    });

    test('recursive calls converge on a shared contract', async () => {
      const { errors, program } = await check(`
        action a(n) [ if (n > 0) { b(n) } addClass("on") ]
        action b(n) [ a(n) ]
        ${timeline('at 0s..1s [ selectElement("#x") a(1) ] []')}
      `);
      expect(errors).toEqual([]);
      const dataflow = createDataflow(ctx.services.Eligian);
      const b = program.statements.find(
        s => (s as ActionDefinition).name === 'b'
      ) as ActionDefinition;
      expect(dataflow.requirementsOf(b).map(r => r.property)).toEqual(['selectedElement']);
    });

    test('an erasure inside an action is an error there, whoever calls it', async () => {
      const { errors } = await check(`
        action broken() [ selectElement("#a") clearOperationData() addClass("on") ]
        ${timeline('at 0s..1s [ selectElement("#a") broken() ] []')}
      `);
      expect(errors.map(e => [e.code, e.text])).toEqual([['erased-property-access', 'addClass']]);
      expect(errors[0].message).toContain("erased by operation 'clearOperationData'");
    });
  });

  describe('entry points', () => {
    test('an event action starts with only eventArgs', async () => {
      const { errors } = await check(`
        on event "language-change" action changed() [ addClass("on") ]
        ${timeline('')}
      `);
      expect(errors.map(e => [e.code, e.text])).toEqual([['missing-dependency', 'addClass']]);
    });

    test('an endable action end block is checked where the timeline ends it', async () => {
      const { errors } = await check(`
        endable action fade() [ selectElement("#a") ] [ removeClass("on") ]
        ${timeline('at 0s..1s fade()')}
      `);
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain("Action 'fade' requires 'selectedElement'");
    });

    test('an end block ends endable callees with the end-block state', async () => {
      const { errors } = await check(`
        endable action fade() [ selectElement("#a") addClass("on") ] [ removeClass("on") ]
        ${timeline('at 0s..1s [ selectElement("#a") fade() ] [ selectElement("#a") fade() ]')}
      `);
      expect(errors).toEqual([]);
    });

    test('sequence and stagger items start with only their arguments', async () => {
      const { errors } = await check(`
        action highlight(item) [ addClass("on") ]
        ${timeline('sequence { highlight(1) for 1s } stagger 1s [1, 2] with highlight() for 1s')}
      `);
      expect(errors.map(e => e.text)).toEqual(['highlight', 'highlight']);
    });
  });

  describe('DOMEventListenerController action lists', () => {
    const wire = (actions: string, data = '') =>
      `action wire() [ selectElement("#b") addController("DOMEventListenerController", "click", ${actions}${data}) ]`;

    test('a listed action that needs selectedElement is reported on its list entry', async () => {
      const { errors } = await check(`
        action onClick() [ addClass("on") ]
        ${wire('["onClick"]')}
        ${timeline('at 0s..1s wire()')}
      `);
      expect(errors).toHaveLength(1);
      expect(errors[0].text).toBe('"onClick"');
      expect(errors[0].message).toContain('DOMEventListenerController does not provide');
    });

    test('actionOperationData keys and earlier actions in the list provide properties', async () => {
      const { errors } = await check(`
        action pick() [ selectElement("#a") ]
        action onClick() [ addClass("on") ]
        action usesData() [ formatText("uppercase") ]
        ${wire('["pick", "onClick", "usesData"]', ', { textContent: "x" }')}
        ${timeline('at 0s..1s wire()')}
      `);
      expect(errors).toEqual([]);
    });

    test('KeyboardController (Eligius 3.1) action lists are checked the same way', async () => {
      const { errors } = await check(`
        action onKey() [ addClass("on") ]
        action wireKeys() [ selectElement("#b") addController("KeyboardController", "right", ["onKey"]) ]
        ${timeline('at 0s..1s wireKeys()')}
      `);
      expect(errors.map(e => e.text)).toEqual(['"onKey"']);
      expect(errors[0].message).toContain('KeyboardController does not provide');
    });
  });

  describe('operations with dynamic outputs', () => {
    test('setOperationData and setData literal keys provide properties', async () => {
      const { errors } = await check(`
        on event "language-change" action a() [
          setOperationData({ textContent: "x" })
          formatText("uppercase")
          setData({ "$operationdata.label": "x" })
          clearOperationData(["label"])
        ]
        ${timeline('')}
      `);
      expect(errors).toEqual([]);
    });

    test('removePropertiesFromOperationData erases literal names', async () => {
      const { errors } = await check(`
        on event "language-change" action a() [
          selectElement("#a")
          removePropertiesFromOperationData(["selectedElement"])
          addClass("on")
        ]
        ${timeline('')}
      `);
      expect(errors.map(e => e.code)).toEqual(['erased-property-access']);
    });

    test('a non-literal argument makes the state unknown, so nothing is reported after it', async () => {
      const { errors } = await check(`
        on event "language-change" action a(data) [
          setOperationData(data)
          addClass("on")
        ]
        ${timeline('')}
      `);
      expect(errors).toEqual([]);
    });
  });
});

describe('operation-data dataflow across library files (spec 047)', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContextWithMockFS();
  });

  test('a library action is checked at the consumer call site, not in the library', async () => {
    const libUri = 'file:///dataflow/lib.eligian';
    const mainUri = 'file:///dataflow/main.eligian';
    const docs = await setupDocuments(ctx, [
      { uri: libUri, content: 'library lib\n\naction highlight() [ addClass("on") ]' },
      {
        uri: mainUri,
        content: `import { highlight } from "./lib.eligian"
timeline "t" in ".c" using raf {
  at 0s..1s highlight()
  at 1s..2s [ selectElement("#a") highlight() ] []
}`,
      },
    ]);

    const errorsIn = (uri: string) =>
      (docs.get(uri)?.diagnostics ?? []).filter(d => CODES.has(String(codeOf(d))));
    expect(errorsIn(libUri)).toEqual([]);
    const main = errorsIn(mainUri);
    expect(main).toHaveLength(1);
    expect(main[0].range.start.line).toBe(2);
    expect(main[0].message).toContain("Action 'highlight' requires 'selectedElement'");
  });
});

describe('requirements of an action', () => {
  test('are listed in the order first needed, with the operation that reads them', async () => {
    const services = createEligianServices((await import('langium')).EmptyFileSystem).Eligian;
    const { parseHelper } = await import('langium/test');
    const doc = await parseHelper<Program>(services)(`
      action a(sel) [ addClass("on") formatText("uppercase") selectElement(sel) ]
      timeline "t" in ".c" using raf {}
    `);
    const action = doc.parseResult.value.statements[0] as ActionDefinition;

    const requirements = createDataflow(services).requirementsOf(action);

    expect(requirements.map(r => [r.property, r.operation])).toEqual([
      ['selectedElement', 'addClass'],
      ['textContent', 'formatText'],
    ]);
  });
});

describe('action hover lists inferred requirements', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  test('hovering a call shows what the caller must provide', async () => {
    const code = `action highlight() [ addClass("on") ]
action show() [ selectElement("#a") highlight() ]
timeline "t" in ".c" using raf { at 0s..1s show() }`;
    const document = await ctx.parse(code);
    await ctx.services.shared.workspace.DocumentBuilder.build([document], { validation: false });
    const offset = code.indexOf('highlight()', code.indexOf('show()')) + 2;

    const hover = await ctx.services.Eligian.lsp.HoverProvider?.getHoverContent(document, {
      textDocument: { uri: document.uri.toString() },
      position: document.textDocument.positionAt(offset),
    });

    const text = hoverContentsText(hover!.contents);
    expect(text).toContain('**Requires from the caller** (operationData):');
    expect(text).toContain('- `selectedElement` (used by addClass)');
  });
});
