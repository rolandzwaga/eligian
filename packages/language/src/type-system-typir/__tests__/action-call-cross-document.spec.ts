/**
 * Regression tests: Typir action function types must match a call by its resolved
 * cross-reference, not by name.
 *
 * Every loaded document registers a Typir function type per action. The call rule used
 * to compare only the call's name text with `action.name`, so same-named actions from
 * other documents acted as overloads (a call passed if ANY of them accepted it), and an
 * aliased import (`import { show as display }`) never matched at all. Results depended on
 * which other documents happened to be loaded in the workspace.
 *
 * Each test uses its own service instance so overloads from earlier tests cannot leak in.
 */

import { describe, expect, test } from 'vitest';
import {
  createTestContextWithMockFS,
  DiagnosticSeverity,
  setupDocuments,
} from '../../__tests__/test-helpers.js';

const LIB_URI = 'file:///test/lib.eligian';
const OTHER_URI = 'file:///test/other.eligian';
const MAIN_URI = 'file:///test/main.eligian';

const LIBRARY = `
  library lib

  action show(txt: string) [
    wait(1)
  ]
`;

/** Build the documents (in the given order) and return Typir call-mismatch errors of main. */
async function mainCallMismatchErrors(documents: Array<{ uri: string; content: string }>) {
  const ctx = createTestContextWithMockFS();
  const docs = await setupDocuments(ctx, documents);
  const main = docs.get(MAIN_URI)!;
  return (main.diagnostics ?? []).filter(
    d => d.severity === DiagnosticSeverity.Error && d.message.includes("don't match")
  );
}

function timelineProgram(body: string, preamble = ''): string {
  return `
    ${preamble}

    timeline "t" in "#c" using raf {
      at 0s..3s ${body}
    }
  `;
}

describe('Typir action call matching across documents', () => {
  const otherDoc = {
    uri: OTHER_URI,
    content: `
      action dup(n: number) [
        wait(1)
      ]

      timeline "o" in "#c" using raf {
        at 0s..1s dup(1)
      }
    `,
  };

  const mainDoc = {
    uri: MAIN_URI,
    content: timelineProgram(
      'dup(5)',
      `
      action dup(a: string) [
        wait(1)
      ]
    `
    ),
  };

  test('baseline: a wrong argument type for a local action is reported', async () => {
    const errors = await mainCallMismatchErrors([mainDoc]);
    expect(errors).toHaveLength(1);
  });

  test('a same-named action in another loaded document does not mask the error', async () => {
    const errors = await mainCallMismatchErrors([otherDoc, mainDoc]);
    expect(errors).toHaveLength(1);
  });

  test('the result does not depend on document load order', async () => {
    const errors = await mainCallMismatchErrors([mainDoc, otherDoc]);
    expect(errors).toHaveLength(1);
  });

  test("the other document's own (valid) call is still accepted", async () => {
    const ctx = createTestContextWithMockFS();
    const docs = await setupDocuments(ctx, [otherDoc, mainDoc]);
    const other = docs.get(OTHER_URI)!;
    const errors = (other.diagnostics ?? []).filter(
      d => d.severity === DiagnosticSeverity.Error && d.message.includes("don't match")
    );
    expect(errors).toEqual([]);
  });
});

describe('Typir action call matching for imported actions', () => {
  const lib = { uri: LIB_URI, content: LIBRARY };

  test('an aliased import call is type-checked against the library action', async () => {
    const errors = await mainCallMismatchErrors([
      lib,
      {
        uri: MAIN_URI,
        content: timelineProgram('display(5)', 'import { show as display } from "./lib.eligian"'),
      },
    ]);
    expect(errors).toHaveLength(1);
  });

  test('an aliased import call with a correct argument type is accepted', async () => {
    const errors = await mainCallMismatchErrors([
      lib,
      {
        uri: MAIN_URI,
        content: timelineProgram('display("a")', 'import { show as display } from "./lib.eligian"'),
      },
    ]);
    expect(errors).toEqual([]);
  });

  test('an unaliased import call is type-checked against the library action', async () => {
    const errors = await mainCallMismatchErrors([
      lib,
      {
        uri: MAIN_URI,
        content: timelineProgram('show(5)', 'import { show } from "./lib.eligian"'),
      },
    ]);
    expect(errors).toHaveLength(1);
  });

  test('a local action is checked against its own signature, not a library overload', async () => {
    const errors = await mainCallMismatchErrors([
      lib,
      {
        uri: MAIN_URI,
        content: timelineProgram(
          'show("a")',
          `
          action show(x: number) [
            wait(1)
          ]
        `
        ),
      },
    ]);
    expect(errors).toHaveLength(1);
  });

  test('a local action called correctly is accepted despite a library overload', async () => {
    const errors = await mainCallMismatchErrors([
      lib,
      {
        uri: MAIN_URI,
        content: timelineProgram(
          'show(5)',
          `
          action show(x: number) [
            wait(1)
          ]
        `
        ),
      },
    ]);
    expect(errors).toEqual([]);
  });
});
