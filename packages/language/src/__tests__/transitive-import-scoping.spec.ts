/**
 * Transitively imported library actions are not in the importer's scope.
 *
 * Regression test for the audit finding (2026-10-22, medium) "Transitively
 * imported library actions leak into the importer's scope and can shadow
 * explicitly imported actions": the actions a nested library imported were
 * pushed before the program's own imports, so with
 *
 *   A: import { bAct } from "./B.eligian"      (B.bAct takes 1 parameter)
 *   D: action bAct(selector, x)                (2 parameters)
 *   program: import { pub } from "./A.eligian"
 *            import { bAct } from "./D.eligian"
 *
 * `bAct("#box", 1)` resolved to B.bAct and reported a wrong argument count,
 * depending on import order.
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

const B_URI = 'file:///transitive-scope/B.eligian';
const D_URI = 'file:///transitive-scope/D.eligian';

function callNamed(document: LangiumDocument, name: string): OperationCall {
  const call = AstUtils.streamAst(document.parseResult.value)
    .filter(isOperationCall)
    .find(c => getOperationCallName(c) === name);
  if (!call) throw new Error(`No call to '${name}'`);
  return call;
}

function errorsOf(document: LangiumDocument): string[] {
  return (document.diagnostics ?? [])
    .filter(d => d.severity === DiagnosticSeverity.Error)
    .map(d => d.message);
}

describe('Transitive library imports are not visible to the importer', () => {
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
        ]
      `,
      B_URI
    );
    await createLibraryDocument(
      ctx,
      `
        library a
        import { bAct } from "./B.eligian"
        action pub(selector: string) [
          bAct(selector)
        ]
      `,
      'file:///transitive-scope/A.eligian'
    );
    await createLibraryDocument(
      ctx,
      `
        library d
        action bAct(selector: string, x: number) [
          selectElement(selector)
        ]
      `,
      D_URI
    );
  });

  async function program(code: string): Promise<LangiumDocument> {
    const document = await ctx.parse(code, {
      documentUri: `file:///transitive-scope/main-${++counter}.eligian`,
    });
    await ctx.services.shared.workspace.DocumentBuilder.build([document], { validation: true });
    return document;
  }

  test.each([
    ['A first', 'import { pub } from "./A.eligian"\nimport { bAct } from "./D.eligian"'],
    ['D first', 'import { bAct } from "./D.eligian"\nimport { pub } from "./A.eligian"'],
  ])('an explicit import wins over a transitive one (%s)', async (_order, imports) => {
    const doc = await program(`
      ${imports}

      timeline "T" in "#app" using raf {
        at 0s..1s pub("#box")
        at 1s..2s bAct("#box", 1)
      }
    `);

    const target = callNamed(doc, 'bAct').operationName.ref;
    expect(target && AstUtils.getDocument(target).uri.toString()).toBe(D_URI);
    expect(errorsOf(doc).filter(m => m.includes('bAct'))).toEqual([]);
  });

  test('an action only imported transitively cannot be called', async () => {
    const doc = await program(`
      import { pub } from "./A.eligian"

      timeline "T" in "#app" using raf {
        at 0s..1s pub("#box")
        at 1s..2s bAct("#box")
      }
    `);

    expect(callNamed(doc, 'bAct').operationName.ref).toBeUndefined();
    expect(errorsOf(doc).some(m => m.includes('bAct'))).toBe(true);
  });
});
