/**
 * Private Action Validation Tests (Feature 023 - User Story 3)
 *
 * Tests that private actions are enforced correctly:
 * - Error when importing private action from library
 * - Error when using 'private' keyword in program file
 * - Private actions accessible within same library
 */

import { beforeAll, describe, expect, test } from 'vitest';
import {
  createLibraryDocument,
  createTestContextWithMockFS,
  type TestContext,
} from '../__tests__/test-helpers.js';

describe('Private Action Validation', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    // Use mock file system to enable cross-document references
    ctx = createTestContextWithMockFS();

    // Create library document with both public and private actions
    await createLibraryDocument(
      ctx,
      `
        library privateLib

        action publicAction(selector: string) [
          selectElement(selector)
        ]

        private action privateAction(selector: string) [
          selectElement(selector)
          addClass("private-effect")
        ]

        action usesPrivateAction(selector: string) [
          privateAction(selector)
        ]
      `,
      'file:///test/privateLib.eligian'
    );
  });

  // T049: Test error when importing private action
  test('importing private action produces validation error', async () => {
    const code = `
      import { privateAction } from "./privateLib.eligian"

      timeline "Test" in ".container" using raf {
        at 0s..2s privateAction("#box")
      }
    `;

    const document = await ctx.parse(code, { documentUri: 'file:///test/main.eligian' });
    await ctx.services.shared.workspace.DocumentBuilder.build([document], {
      validation: true,
    });

    const diagnostics =
      await ctx.services.Eligian.validation.DocumentValidator.validateDocument(document);
    const importErrors = diagnostics.filter(d => d.code === 'import_private_action');

    expect(importErrors.length).toBeGreaterThan(0);
    expect(importErrors[0].message).toContain('private');
    expect(importErrors[0].message).toContain('privateAction');
  });

  test('importing public action from library with private actions succeeds', async () => {
    const code = `
      import { publicAction } from "./privateLib.eligian"

      timeline "Test" in ".container" using raf {
        at 0s..2s publicAction("#box")
      }
    `;

    const document = await ctx.parse(code, { documentUri: 'file:///test/main2.eligian' });
    await ctx.services.shared.workspace.DocumentBuilder.build([document], {
      validation: true,
    });

    const diagnostics =
      await ctx.services.Eligian.validation.DocumentValidator.validateDocument(document);
    const importErrors = diagnostics.filter(d => d.code === 'import_private_action');

    // No errors - public action can be imported
    expect(importErrors.length).toBe(0);
  });

  // T050: Test error when using 'private' in program file
  test('using private keyword in program file produces validation error', async () => {
    const code = `
      private action invalidPrivate(selector: string) [
        selectElement(selector)
      ]

      timeline "Test" in ".container" using raf {
        at 0s..2s invalidPrivate("#box")
      }
    `;

    const document = await ctx.parse(code, { documentUri: 'file:///test/program.eligian' });
    await ctx.services.shared.workspace.DocumentBuilder.build([document], {
      validation: true,
    });

    const diagnostics =
      await ctx.services.Eligian.validation.DocumentValidator.validateDocument(document);
    const privateErrors = diagnostics.filter(d => d.code === 'private_only_in_libraries');

    expect(privateErrors.length).toBeGreaterThan(0);
    expect(privateErrors[0].message).toContain('private');
    expect(privateErrors[0].message).toContain('library');
  });

  test('using private keyword in library file succeeds', async () => {
    const code = `
      library validLib

      private action validPrivate(selector: string) [
        selectElement(selector)
      ]

      action publicAction(selector: string) [
        validPrivate(selector)
      ]
    `;

    const document = await ctx.parse(code, { documentUri: 'file:///test/validLib.eligian' });
    await ctx.services.shared.workspace.DocumentBuilder.build([document], {
      validation: true,
    });

    const diagnostics =
      await ctx.services.Eligian.validation.DocumentValidator.validateDocument(document);
    const privateErrors = diagnostics.filter(d => d.code === 'private_only_in_libraries');

    // No errors - private allowed in library files
    expect(privateErrors.length).toBe(0);
  });

  // T051: Test private actions accessible within same library
  test('private action can be called from public action in same library', async () => {
    const code = `
      library internalLib

      private action internalHelper(selector: string) [
        selectElement(selector)
        addClass("helper-applied")
      ]

      action publicWrapper(selector: string) [
        internalHelper(selector)
      ]
    `;

    const document = await ctx.parse(code, { documentUri: 'file:///test/internalLib.eligian' });
    await ctx.services.shared.workspace.DocumentBuilder.build([document], {
      validation: true,
    });

    const diagnostics =
      await ctx.services.Eligian.validation.DocumentValidator.validateDocument(document);

    // No errors - private action can be called within same library
    expect(diagnostics.length).toBe(0);
  });

  test('private action can be called from another private action in same library', async () => {
    const code = `
      library chainLib

      private action helperA(selector: string) [
        selectElement(selector)
      ]

      private action helperB(selector: string) [
        selectElement(selector)
        helperA(selector)
        addClass("chain")
      ]

      action publicEntry(selector: string) [
        helperB(selector)
      ]
    `;

    const document = await ctx.parse(code, { documentUri: 'file:///test/chainLib.eligian' });
    await ctx.services.shared.workspace.DocumentBuilder.build([document], {
      validation: true,
    });

    const diagnostics =
      await ctx.services.Eligian.validation.DocumentValidator.validateDocument(document);

    // No errors - private actions can call each other within same library
    expect(diagnostics.length).toBe(0);
  });
});
