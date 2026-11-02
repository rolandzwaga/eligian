/**
 * Aliased / duplicate imports of the same library action (audit 2026-10-22,
 * low finding #23).
 *
 * The scope provider used to name every imported action's scope entry with the
 * FIRST alias found for its ActionDefinition (reverse lookup). Importing the
 * same action under two names (two aliases, or aliased once and plain once)
 * therefore described it twice under the first name, leaving the second name
 * unresolved: no go-to-definition, JSDoc hover or rename, while the validators
 * (which use an alias map) reported nothing.
 *
 * Scope entries are now built per ActionImport (alias ?? original name), so
 * each imported name resolves to the shared definition.
 */

import { AstUtils, type LangiumDocument } from 'langium';
import { beforeAll, describe, expect, test } from 'vitest';
import { isOperationCall, type OperationCall } from '../generated/ast.js';
import { getOperationCallName } from '../utils/operation-call-utils.js';
import {
  createLibraryDocument,
  createTestContextWithMockFS,
  DiagnosticSeverity,
  type TestContext,
} from './test-helpers.js';

const LIBRARY_URI = 'file:///dup-alias/b.eligian';

/** Errors other than CSS validation (these programs import no stylesheet). */
function errorsOf(document: LangiumDocument) {
  return (document.diagnostics ?? []).filter(
    d => d.severity === DiagnosticSeverity.Error && !d.message.includes('CSS')
  );
}

function callNamed(document: LangiumDocument, name: string): OperationCall {
  const call = AstUtils.streamAst(document.parseResult.value)
    .filter(isOperationCall)
    .find(c => getOperationCallName(c) === name);
  if (!call) throw new Error(`No call to '${name}' in ${document.uri.toString()}`);
  return call;
}

function expectResolvesToLibraryAction(document: LangiumDocument, name: string): void {
  const target = callNamed(document, name).operationName.ref;
  expect(target?.name, `'${name}' should resolve`).toBe('bAct');
  expect(target && AstUtils.getDocument(target).uri.toString()).toBe(LIBRARY_URI);
}

describe('Aliased and duplicate imports of the same action (audit #23)', () => {
  let ctx: TestContext;
  let counter = 0;

  beforeAll(async () => {
    ctx = createTestContextWithMockFS();
    await createLibraryDocument(
      ctx,
      `
        library b

        action bAct(selector: string) [
          selectElement(selector)
          addClass("active")
        ]
      `,
      LIBRARY_URI
    );
  });

  async function program(code: string): Promise<LangiumDocument> {
    const document = await ctx.parse(code, {
      documentUri: `file:///dup-alias/main-${++counter}.eligian`,
    });
    await ctx.services.shared.workspace.DocumentBuilder.build([document], { validation: true });
    return document;
  }

  async function library(code: string): Promise<LangiumDocument> {
    return createLibraryDocument(ctx, code, `file:///dup-alias/lib-${++counter}.eligian`);
  }

  test('two aliases of the same action both resolve (separate import statements)', async () => {
    const doc = await program(`
      import { bAct as foo } from "./b.eligian"
      import { bAct as bar } from "./b.eligian"

      timeline "T" in ".container" using raf {
        at 0s..1s foo("#box")
        at 1s..2s bar("#box")
      }
    `);

    expect(errorsOf(doc).map(e => e.message)).toEqual([]);
    expectResolvesToLibraryAction(doc, 'foo');
    expectResolvesToLibraryAction(doc, 'bar');
  });

  test('two aliases of the same action in one import statement both resolve', async () => {
    const doc = await program(`
      import { bAct as foo, bAct as bar } from "./b.eligian"

      timeline "T" in ".container" using raf {
        at 0s..1s foo("#box")
        at 1s..2s bar("#box")
      }
    `);

    expect(errorsOf(doc).map(e => e.message)).toEqual([]);
    expectResolvesToLibraryAction(doc, 'foo');
    expectResolvesToLibraryAction(doc, 'bar');
  });

  test('a plain import after an aliased import of the same action resolves', async () => {
    const doc = await program(`
      import { bAct as foo } from "./b.eligian"
      import { bAct } from "./b.eligian"

      timeline "T" in ".container" using raf {
        at 0s..1s foo("#box")
        at 1s..2s bAct("#box")
      }
    `);

    expect(errorsOf(doc).map(e => e.message)).toEqual([]);
    expectResolvesToLibraryAction(doc, 'foo');
    expectResolvesToLibraryAction(doc, 'bAct');
  });

  test('an aliased import after a plain import of the same action resolves', async () => {
    const doc = await program(`
      import { bAct } from "./b.eligian"
      import { bAct as foo } from "./b.eligian"

      timeline "T" in ".container" using raf {
        at 0s..1s bAct("#box")
        at 1s..2s foo("#box")
      }
    `);

    expect(errorsOf(doc).map(e => e.message)).toEqual([]);
    expectResolvesToLibraryAction(doc, 'bAct');
    expectResolvesToLibraryAction(doc, 'foo');
  });

  test('a library importing the same action under two aliases resolves both', async () => {
    const doc = await library(`
      library consumer

      import { bAct as foo } from "./b.eligian"
      import { bAct as bar } from "./b.eligian"

      action both(selector: string) [
        foo(selector)
        bar(selector)
      ]
    `);

    expect(errorsOf(doc).map(e => e.message)).toEqual([]);
    expectResolvesToLibraryAction(doc, 'foo');
    expectResolvesToLibraryAction(doc, 'bar');
  });
});
