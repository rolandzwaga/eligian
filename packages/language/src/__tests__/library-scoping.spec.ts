/**
 * Library Scoping Tests (Feature 023 - User Story 3)
 *
 * Tests that the custom scope provider correctly:
 * - Filters private actions from exports (not visible in imports)
 * - Includes public actions in exports (visible in imports)
 */

import { beforeAll, describe, expect, test } from 'vitest';
import {
  createLibraryDocument,
  createTestContextWithMockFS,
  type TestContext,
} from '../__tests__/test-helpers.js';
import type { ActionImport, LibraryImport } from '../generated/ast.js';
import { isLibraryImport } from '../generated/ast.js';

describe('Library Scoping', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    // Use mock file system to enable cross-document references
    ctx = createTestContextWithMockFS();

    // Create library document with mixed public and private actions
    await createLibraryDocument(
      ctx,
      `
        library mixedLib

        action publicOne(selector: string) [
          selectElement(selector)
        ]

        private action privateOne(selector: string) [
          selectElement(selector)
        ]

        action publicTwo(selector: string) [
          selectElement(selector)
        ]

        private action privateTwo(selector: string) [
          selectElement(selector)
        ]

        action publicThree(selector: string) [
          selectElement(selector)
        ]
      `,
      'file:///test/mixedLib.eligian'
    );

    // Create library with only public actions
    await createLibraryDocument(
      ctx,
      `
        library publicOnlyLib

        action actionA(selector: string) [
          selectElement(selector)
        ]

        action actionB(selector: string) [
          selectElement(selector)
        ]
      `,
      'file:///test/publicOnlyLib.eligian'
    );

    // Create library with only private actions
    await createLibraryDocument(
      ctx,
      `
        library privateOnlyLib

        private action secretOne(selector: string) [
          selectElement(selector)
        ]

        private action secretTwo(selector: string) [
          selectElement(selector)
        ]
      `,
      'file:///test/privateOnlyLib.eligian'
    );
  });

  // T052: Test scope provider filters private actions from exports
  test('scope provider filters private actions from mixed library', async () => {
    const code = `
      import { publicOne } from "./mixedLib.eligian"

      timeline "Test" in ".container" using raf {
        at 0s..2s publicOne("#box")
      }
    `;

    const document = await ctx.parse(code, { documentUri: 'file:///test/test1.eligian' });
    await ctx.services.shared.workspace.DocumentBuilder.build([document], {
      validation: true,
    });

    // Get the import statement
    const program = document.parseResult.value;
    const importStmt = program.statements.find(isLibraryImport) as LibraryImport;
    expect(importStmt).toBeDefined();

    // Get the action import reference
    const actionImport = importStmt.actions[0] as ActionImport;
    expect(actionImport).toBeDefined();

    // Get the scope for this reference
    const scopeProvider = ctx.services.Eligian.references.ScopeProvider;
    const referenceInfo = {
      reference: { $refText: actionImport.name },
      container: actionImport,
      property: 'action',
    };

    const scope = scopeProvider.getScope(referenceInfo as any);

    // Collect all available action names in scope
    const availableActions = Array.from(scope.getAllElements()).map(elem => elem.name);

    // Public actions should be available
    expect(availableActions).toContain('publicOne');
    expect(availableActions).toContain('publicTwo');
    expect(availableActions).toContain('publicThree');

    // Private actions should NOT be available
    expect(availableActions).not.toContain('privateOne');
    expect(availableActions).not.toContain('privateTwo');
  });

  test('scope provider excludes all actions from private-only library', async () => {
    const code = `
      import { secretOne } from "./privateOnlyLib.eligian"

      timeline "Test" in ".container" using raf {
        at 0s..2s secretOne("#box")
      }
    `;

    const document = await ctx.parse(code, { documentUri: 'file:///test/test2.eligian' });
    await ctx.services.shared.workspace.DocumentBuilder.build([document], {
      validation: true,
    });

    // Get the import statement
    const program = document.parseResult.value;
    const importStmt = program.statements.find(isLibraryImport) as LibraryImport;
    expect(importStmt).toBeDefined();

    // Get the action import reference
    const actionImport = importStmt.actions[0] as ActionImport;
    expect(actionImport).toBeDefined();

    // Get the scope for this reference
    const scopeProvider = ctx.services.Eligian.references.ScopeProvider;
    const referenceInfo = {
      reference: { $refText: actionImport.name },
      container: actionImport,
      property: 'action',
    };

    const scope = scopeProvider.getScope(referenceInfo as any);

    // Collect all available action names in scope
    const availableActions = Array.from(scope.getAllElements()).map(elem => elem.name);

    // No actions should be available (all are private)
    expect(availableActions).not.toContain('secretOne');
    expect(availableActions).not.toContain('secretTwo');
    expect(availableActions.length).toBe(0);
  });

  // T053: Test scope provider includes public actions in exports
  test('scope provider includes all public actions from public-only library', async () => {
    const code = `
      import { actionA } from "./publicOnlyLib.eligian"

      timeline "Test" in ".container" using raf {
        at 0s..2s actionA("#box")
      }
    `;

    const document = await ctx.parse(code, { documentUri: 'file:///test/test3.eligian' });
    await ctx.services.shared.workspace.DocumentBuilder.build([document], {
      validation: true,
    });

    // Get the import statement
    const program = document.parseResult.value;
    const importStmt = program.statements.find(isLibraryImport) as LibraryImport;
    expect(importStmt).toBeDefined();

    // Get the action import reference
    const actionImport = importStmt.actions[0] as ActionImport;
    expect(actionImport).toBeDefined();

    // Get the scope for this reference
    const scopeProvider = ctx.services.Eligian.references.ScopeProvider;
    const referenceInfo = {
      reference: { $refText: actionImport.name },
      container: actionImport,
      property: 'action',
    };

    const scope = scopeProvider.getScope(referenceInfo as any);

    // Collect all available action names in scope
    const availableActions = Array.from(scope.getAllElements()).map(elem => elem.name);

    // All public actions should be available
    expect(availableActions).toContain('actionA');
    expect(availableActions).toContain('actionB');
    expect(availableActions.length).toBe(2);
  });

  test('scope provider includes correct actions when importing multiple actions', async () => {
    const code = `
      import { publicOne, publicTwo } from "./mixedLib.eligian"

      timeline "Test" in ".container" using raf {
        at 0s..2s publicOne("#box")
        at 2s..4s publicTwo("#box")
      }
    `;

    const document = await ctx.parse(code, { documentUri: 'file:///test/test4.eligian' });
    await ctx.services.shared.workspace.DocumentBuilder.build([document], {
      validation: true,
    });

    // Get the import statement
    const program = document.parseResult.value;
    const importStmt = program.statements.find(isLibraryImport) as LibraryImport;
    expect(importStmt).toBeDefined();

    // Check first action import
    const actionImport1 = importStmt.actions[0] as ActionImport;
    const referenceInfo1 = {
      reference: { $refText: actionImport1.name },
      container: actionImport1,
      property: 'action',
    };

    const scope1 = ctx.services.Eligian.references.ScopeProvider.getScope(referenceInfo1 as any);
    const availableActions1 = Array.from(scope1.getAllElements()).map(elem => elem.name);

    expect(availableActions1).toContain('publicOne');
    expect(availableActions1).not.toContain('privateOne');

    // Check second action import
    const actionImport2 = importStmt.actions[1] as ActionImport;
    const referenceInfo2 = {
      reference: { $refText: actionImport2.name },
      container: actionImport2,
      property: 'action',
    };

    const scope2 = ctx.services.Eligian.references.ScopeProvider.getScope(referenceInfo2 as any);
    const availableActions2 = Array.from(scope2.getAllElements()).map(elem => elem.name);

    expect(availableActions2).toContain('publicTwo');
    expect(availableActions2).not.toContain('privateTwo');
  });
});
