/**
 * Library Definition Tests (Feature 023 - User Story 4)
 *
 * Tests that IDE go-to-definition functionality works correctly for imported actions:
 * - Navigates to the action definition in the library file
 * - Works for both direct imports and aliased imports
 */

import { AstUtils } from 'langium';
import { beforeAll, describe, expect, test } from 'vitest';
import {
  createLibraryDocument,
  createTestContextWithMockFS,
  type TestContext,
} from '../__tests__/test-helpers.js';
import { isActionDefinition, isOperationCall } from '../generated/ast.js';

describe('Library Definition', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    // Use mock file system to enable cross-document references
    ctx = createTestContextWithMockFS();

    // Create library document with actions
    await createLibraryDocument(
      ctx,
      `
        library definitionLib

        action fadeIn(selector: string, duration: number) [
          selectElement(selector)
          animate({opacity: 1}, duration)
        ]

        action slideIn(selector: string) [
          selectElement(selector)
          animate({transform: "translateX(0)"}, 500)
        ]
      `,
      'file:///test/definitionLib.eligian'
    );
  });

  // T064: Test go-to-definition navigates to library file
  test('cross-reference resolves to action in library file', async () => {
    const code = `
      import { fadeIn } from "./definitionLib.eligian"

      timeline "Test" in ".container" using raf {
        at 0s..2s fadeIn("#box", 1000)
      }
    `;

    const document = await ctx.parse(code, {
      documentUri: 'file:///test/definition-test.eligian',
    });
    await ctx.services.shared.workspace.DocumentBuilder.build([document], {
      validation: true,
    });

    // Find the OperationCall node for fadeIn
    const program = document.parseResult.value;
    const operationCall = AstUtils.streamAllContents(program)
      .filter(isOperationCall)
      .find(op => op.operationName?.$refText === 'fadeIn');

    expect(operationCall).toBeDefined();

    // Verify cross-reference resolves to action definition
    const actionRef = operationCall?.operationName?.ref;
    expect(actionRef).toBeDefined();
    expect(isActionDefinition(actionRef!)).toBe(true);

    // Verify the action is in the library file (not the current document)
    const actionDoc = AstUtils.getDocument(actionRef!);
    expect(actionDoc.uri.toString()).toContain('definitionLib.eligian');

    // Verify it's the correct action
    if (isActionDefinition(actionRef!)) {
      expect(actionRef!.name).toBe('fadeIn');
    }
  });

  test('cross-reference resolves for aliased imports', async () => {
    const code = `
      import { fadeIn as customFade } from "./definitionLib.eligian"

      timeline "Test" in ".container" using raf {
        at 0s..2s customFade("#box", 1000)
      }
    `;

    const document = await ctx.parse(code, {
      documentUri: 'file:///test/definition-test-alias.eligian',
    });
    await ctx.services.shared.workspace.DocumentBuilder.build([document], {
      validation: true,
    });

    // Find the OperationCall node for customFade
    const program = document.parseResult.value;
    const operationCall = AstUtils.streamAllContents(program)
      .filter(isOperationCall)
      .find(op => op.operationName?.$refText === 'customFade');

    expect(operationCall).toBeDefined();

    // Verify cross-reference resolves to the original fadeIn action
    const actionRef = operationCall?.operationName?.ref;
    expect(actionRef).toBeDefined();
    expect(isActionDefinition(actionRef!)).toBe(true);

    // Verify the action is in the library file
    const actionDoc = AstUtils.getDocument(actionRef!);
    expect(actionDoc.uri.toString()).toContain('definitionLib.eligian');

    // Verify it's the correct action (original name is fadeIn)
    if (isActionDefinition(actionRef!)) {
      expect(actionRef!.name).toBe('fadeIn');
    }
  });
});
