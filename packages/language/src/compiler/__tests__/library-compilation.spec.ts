/**
 * Library Compilation Tests (Feature 023 - User Story 2)
 *
 * Tests that imported actions compile identically to locally-defined actions.
 * Verifies that library imports result in the exact same Eligius JSON output
 * as if the action was defined locally.
 */

import { Effect } from 'effect';
import { beforeAll, describe, expect, test } from 'vitest';
import {
  createLibraryDocument,
  createTestContextWithMockFS,
  type TestContext,
} from '../../__tests__/test-helpers.js';
import type { Program } from '../../generated/ast.js';
import { transformAST } from '../ast-transformer.js';

describe('Library Compilation', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    // Use mock file system to enable cross-document references
    ctx = createTestContextWithMockFS();

    // Create library documents for tests
    // animations.eligian - library with fadeIn and showThenHide actions
    await createLibraryDocument(
      ctx,
      `
        library animations

        action fadeIn(selector: string, duration: number) [
          selectElement(selector)
          animate({opacity: 1}, duration)
        ]

        endable action showThenHide(selector: string) [
          selectElement(selector)
          addClass("visible")
        ] [
          selectElement(selector)
          removeClass("visible")
        ]
      `,
      'file:///test/animations.eligian'
    );

    // utils.eligian - library with setColor action
    await createLibraryDocument(
      ctx,
      `
        library utils

        action setColor(selector: string, color: string, duration: number) [
          selectElement(selector)
          animate({backgroundColor: color}, duration)
        ]
      `,
      'file:///test/utils.eligian'
    );
  });

  /**
   * Helper: Parse and build DSL code
   */
  async function parseDSL(code: string, documentUri: string): Promise<Program> {
    const document = await ctx.parse(code, { documentUri });
    await ctx.services.shared.workspace.DocumentBuilder.build([document], {
      validation: true,
    });

    if (document.parseResult.parserErrors.length > 0) {
      throw new Error(
        `Parse errors: ${document.parseResult.parserErrors.map(e => e.message).join(', ')}`
      );
    }
    return document.parseResult.value;
  }

  // T038: Test imported action compiles identically to local action
  test('imported action compiles identically to local action', async () => {
    // Program with LOCAL action definition
    const localActionCode = `
      action fadeIn(selector: string, duration: number) [
        selectElement(selector)
        animate({opacity: 1}, duration)
      ]

      timeline "Test" in ".container" using raf {
        at 0s..5s fadeIn("#box", 1000)
      }
    `;

    // Program with IMPORTED action (will be merged by compiler)
    const importedActionCode = `
      import { fadeIn } from "./animations.eligian"

      timeline "Test" in ".container" using raf {
        at 0s..5s fadeIn("#box", 1000)
      }
    `;

    const localProgram = await parseDSL(localActionCode, 'file:///test/local.eligian');
    const importedProgram = await parseDSL(importedActionCode, 'file:///test/imported.eligian');

    const localResult = await Effect.runPromise(transformAST(localProgram));
    const importedResult = await Effect.runPromise(transformAST(importedProgram));

    // Both should produce identical Eligius JSON for the timeline event (ignoring UUIDs)
    expect(localResult.config.timelines[0].timelineActions.length).toBe(
      importedResult.config.timelines[0].timelineActions.length
    );

    // Both should have the same custom action definition (ignoring UUIDs)
    expect(localResult.config.actions.length).toBe(importedResult.config.actions.length);
    expect(localResult.config.actions[0].name).toBe(importedResult.config.actions[0].name);
    expect(localResult.config.actions[0].startOperations.length).toBe(
      importedResult.config.actions[0].startOperations.length
    );
    expect(localResult.config.actions[0].endOperations.length).toBe(
      importedResult.config.actions[0].endOperations.length
    );
  });

  test('imported endable action compiles identically to local endable action', async () => {
    // Program with LOCAL endable action
    const localCode = `
      endable action showThenHide(selector: string) [
        selectElement(selector)
        addClass("visible")
      ] [
        selectElement(selector)
        removeClass("visible")
      ]

      timeline "Test" in ".container" using raf {
        at 0s..5s showThenHide("#box")
      }
    `;

    // Program with IMPORTED endable action
    const importedCode = `
      import { showThenHide } from "./animations.eligian"

      timeline "Test" in ".container" using raf {
        at 0s..5s showThenHide("#box")
      }
    `;

    const localProgram = await parseDSL(localCode, 'file:///test/local2.eligian');
    const importedProgram = await parseDSL(importedCode, 'file:///test/imported2.eligian');

    const localResult = await Effect.runPromise(transformAST(localProgram));
    const importedResult = await Effect.runPromise(transformAST(importedProgram));

    // Both should produce identical output (ignoring UUIDs)
    expect(localResult.config.timelines[0].timelineActions.length).toBe(
      importedResult.config.timelines[0].timelineActions.length
    );
    expect(localResult.config.actions.length).toBe(importedResult.config.actions.length);
    expect(localResult.config.actions[0].name).toBe(importedResult.config.actions[0].name);
    expect(localResult.config.actions[0].startOperations.length).toBe(
      importedResult.config.actions[0].startOperations.length
    );
    expect(localResult.config.actions[0].endOperations.length).toBe(
      importedResult.config.actions[0].endOperations.length
    );
  });

  test('imported action with parameters compiles correctly', async () => {
    // Program with LOCAL parameterized action
    const localCode = `
      action setColor(selector: string, color: string, duration: number) [
        selectElement(selector)
        animate({backgroundColor: color}, duration)
      ]

      timeline "Test" in ".container" using raf {
        at 0s..2s setColor("#box", "red", 500)
      }
    `;

    // Program with IMPORTED parameterized action
    const importedCode = `
      import { setColor } from "./utils.eligian"

      timeline "Test" in ".container" using raf {
        at 0s..2s setColor("#box", "red", 500)
      }
    `;

    const localProgram = await parseDSL(localCode, 'file:///test/local3.eligian');
    const importedProgram = await parseDSL(importedCode, 'file:///test/imported3.eligian');

    const localResult = await Effect.runPromise(transformAST(localProgram));
    const importedResult = await Effect.runPromise(transformAST(importedProgram));

    // Both should produce identical output (ignoring UUIDs)
    expect(localResult.config.timelines[0].timelineActions.length).toBe(
      importedResult.config.timelines[0].timelineActions.length
    );
    expect(localResult.config.actions.length).toBe(importedResult.config.actions.length);
    expect(localResult.config.actions[0].name).toBe(importedResult.config.actions[0].name);
    expect(localResult.config.actions[0].startOperations.length).toBe(
      importedResult.config.actions[0].startOperations.length
    );
    expect(localResult.config.actions[0].endOperations.length).toBe(
      importedResult.config.actions[0].endOperations.length
    );
  });
});
