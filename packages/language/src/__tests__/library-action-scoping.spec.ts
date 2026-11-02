/**
 * Library action scoping in the IDE (Feature 023 FR-010, Feature 032 US3)
 *
 * Regression tests for the audit finding "Library files cannot call actions
 * they import": the scope provider returned only a library's own actions and
 * the existence / parameter validators only looked at imports of Programs, so a
 * library calling an imported action got `Unknown operation`, with no
 * go-to-definition or hover.
 *
 * Expected scoping (shared with the compiler):
 * - A library sees all of its own actions (private ones included) plus the
 *   actions it imports, under their alias when aliased.
 * - A program sees its local actions plus the actions it imports itself, under
 *   their alias when aliased. Never a library's private helpers and never the
 *   actions a library imports from another library.
 */

import { AstUtils, type LangiumDocument, URI } from 'langium';
import { beforeAll, describe, expect, test } from 'vitest';
import { isOperationCall, type OperationCall } from '../generated/ast.js';
import { getOperationCallName } from '../utils/operation-call-utils.js';
import {
  createLibraryDocument,
  createTestContextWithMockFS,
  DiagnosticSeverity,
  type TestContext,
} from './test-helpers.js';

function errorsOf(document: LangiumDocument) {
  return (document.diagnostics ?? []).filter(d => d.severity === DiagnosticSeverity.Error);
}

function callNamed(document: LangiumDocument, name: string): OperationCall {
  const call = AstUtils.streamAst(document.parseResult.value)
    .filter(isOperationCall)
    .find(c => getOperationCallName(c) === name);
  if (!call) throw new Error(`No call to '${name}' in ${document.uri.toString()}`);
  return call;
}

describe('Library action scoping (IDE)', () => {
  let ctx: TestContext;
  let counter = 0;

  beforeAll(async () => {
    ctx = createTestContextWithMockFS();

    await createLibraryDocument(
      ctx,
      `
        library animations

        private action prep(selector: string) [
          selectElement(selector)
        ]

        action fadeIn(selector: string, duration: number) [
          selectElement(selector)
          prep(selector)
          animate({opacity: 1}, duration)
        ]
      `,
      'file:///ide-scope/animations.eligian'
    );
  });

  async function library(code: string): Promise<LangiumDocument> {
    return createLibraryDocument(ctx, code, `file:///ide-scope/lib-${++counter}.eligian`);
  }

  async function program(code: string): Promise<LangiumDocument> {
    const document = await ctx.parse(code, {
      documentUri: `file:///ide-scope/main-${++counter}.eligian`,
    });
    await ctx.services.shared.workspace.DocumentBuilder.build([document], { validation: true });
    return document;
  }

  test('a library can call an action it imports (resolves, no unknown-operation error)', async () => {
    const doc = await library(`
      library transitions

      import { fadeIn } from "./animations.eligian"

      action slideAndFade(selector: string) [
        selectElement(selector)
        fadeIn(selector, 500)
      ]
    `);

    expect(errorsOf(doc).map(e => e.message)).toEqual([]);
    const target = callNamed(doc, 'fadeIn').operationName.ref;
    expect(target?.name).toBe('fadeIn');
    expect(target && AstUtils.getDocument(target).uri.toString()).toBe(
      'file:///ide-scope/animations.eligian'
    );
  });

  test('a library can call an imported action by its alias', async () => {
    const doc = await library(`
      library transitions

      import { fadeIn as fi } from "./animations.eligian"

      action slideAndFade(selector: string) [
        fi(selector, 500)
      ]
    `);

    expect(errorsOf(doc).map(e => e.message)).toEqual([]);
    expect(callNamed(doc, 'fi').operationName.ref?.name).toBe('fadeIn');
  });

  test('a library cannot call an aliased import by its original name', async () => {
    const doc = await library(`
      library transitions

      import { fadeIn as fi } from "./animations.eligian"

      action slideAndFade(selector: string) [
        fadeIn(selector, 500)
      ]
    `);

    expect(callNamed(doc, 'fadeIn').operationName.ref).toBeUndefined();
    expect(errorsOf(doc).some(e => e.message.includes('fadeIn'))).toBe(true);
  });

  test('parameter counts are validated for actions a library imports', async () => {
    const doc = await library(`
      library transitions

      import { fadeIn } from "./animations.eligian"

      action slideAndFade(selector: string) [
        fadeIn(selector)
      ]
    `);

    const errors = errorsOf(doc);
    expect(
      errors.some(e => e.message.includes('fadeIn') && /argument|parameter/i.test(e.message))
    ).toBe(true);
  });

  test('a library cannot call a private action of a library it imports from', async () => {
    const doc = await library(`
      library transitions

      import { fadeIn } from "./animations.eligian"

      action slideAndFade(selector: string) [
        prep(selector)
      ]
    `);

    expect(callNamed(doc, 'prep').operationName.ref).toBeUndefined();
    expect(errorsOf(doc).some(e => e.message.includes('prep'))).toBe(true);
  });

  test('a library private helper still resolves inside its own library', async () => {
    const doc = ctx.services.shared.workspace.LangiumDocuments.getDocument(
      URI.parse('file:///ide-scope/animations.eligian')
    );
    expect(doc).toBeDefined();
    if (!doc) return;
    expect(errorsOf(doc).map(e => e.message)).toEqual([]);
    expect(callNamed(doc, 'prep').operationName.ref?.name).toBe('prep');
  });

  test('a program cannot call a private helper of a library it imports from', async () => {
    const doc = await program(`
      import { fadeIn } from "./animations.eligian"

      action local(selector: string) [
        prep(selector)
      ]

      timeline "T" in ".container" using raf {
        at 0s..1s local("#a")
      }
    `);

    expect(callNamed(doc, 'prep').operationName.ref).toBeUndefined();
    expect(errorsOf(doc).some(e => e.message.includes('prep'))).toBe(true);
  });

  test('a program cannot call actions its imported library imports (not re-exported)', async () => {
    await createLibraryDocument(
      ctx,
      `
        library transitions

        import { fadeIn } from "./animations.eligian"

        action slideAndFade(selector: string) [
          fadeIn(selector, 500)
        ]
      `,
      'file:///ide-scope/transitions.eligian'
    );

    const doc = await program(`
      import { slideAndFade } from "./transitions.eligian"

      action local(selector: string) [
        fadeIn(selector, 100)
      ]

      timeline "T" in ".container" using raf {
        at 0s..1s local("#a")
        at 1s..2s slideAndFade("#a")
      }
    `);

    expect(callNamed(doc, 'fadeIn').operationName.ref).toBeUndefined();
    expect(callNamed(doc, 'slideAndFade').operationName.ref?.name).toBe('slideAndFade');
    expect(errorsOf(doc).some(e => e.message.includes('fadeIn'))).toBe(true);
  });

  test('a program cannot call an aliased import by its original name', async () => {
    const doc = await program(`
      import { fadeIn as fi } from "./animations.eligian"

      action local(selector: string) [
        fadeIn(selector, 100)
      ]

      timeline "T" in ".container" using raf {
        at 0s..1s local("#a")
        at 1s..2s fi("#a", 100)
      }
    `);

    expect(callNamed(doc, 'fadeIn').operationName.ref).toBeUndefined();
    expect(callNamed(doc, 'fi').operationName.ref?.name).toBe('fadeIn');
    expect(errorsOf(doc).some(e => e.message.includes('fadeIn'))).toBe(true);
  });

  // Audit regression: a library that defines AND imports the same name used to
  // link its own calls silently to the import, with no diagnostic.
  test('a library that defines and imports the same action name is reported', async () => {
    const doc = await library(`
      library shadow

      import { fadeIn } from "./animations.eligian"

      action fadeIn(selector: string, duration: number) [
        selectElement(selector)
        addClass("own")
      ]

      action pub(selector: string) [
        fadeIn(selector, 100)
      ]
    `);

    const collisions = (doc.diagnostics ?? []).filter(d => d.code === 'import_name_collision');
    expect(collisions).toHaveLength(1);
    expect(collisions[0].severity).toBe(DiagnosticSeverity.Error);
    expect(collisions[0].message).toContain("'fadeIn'");
    // The library's own action wins, in the IDE as in the compiler
    const target = callNamed(doc, 'fadeIn').operationName.ref;
    expect(target && AstUtils.getDocument(target).uri.toString()).toBe(doc.uri.toString());
  });

  test('a library importing the same name twice is reported', async () => {
    const doc = await library(`
      library twice

      import { fadeIn } from "./animations.eligian"
      import { fadeIn as fi, fadeIn as fi } from "./animations.eligian"

      action pub(selector: string) [
        fi(selector, 100)
      ]
    `);

    const collisions = (doc.diagnostics ?? []).filter(d => d.code === 'import_name_collision');
    expect(collisions.map(d => d.message)).toEqual([
      "Duplicate import: action 'fi' is already imported",
    ]);
  });
});
