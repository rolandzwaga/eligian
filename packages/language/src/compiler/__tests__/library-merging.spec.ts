/**
 * Library Merging Tests (Feature 023 - User Story 2)
 *
 * Tests that imported actions are correctly merged into the program AST
 * before compilation. Verifies that:
 * - Imported actions are added to the program's action registry
 * - Aliased actions use the alias name in compilation
 * - Multiple imports from different libraries are merged correctly
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

describe('Library Merging', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    // Use mock file system to enable cross-document references
    ctx = createTestContextWithMockFS();

    // Create library documents for tests
    // animations.eligian - library with fadeIn, fadeOut, slideIn actions
    await createLibraryDocument(
      ctx,
      `
        library animations

        action fadeIn(selector: string, duration: number) [
          selectElement(selector)
          animate({opacity: 1}, duration)
        ]

        action fadeOut(selector: string, duration: number) [
          selectElement(selector)
          animate({opacity: 0}, duration)
        ]

        action slideIn(selector: string, duration: number) [
          selectElement(selector)
          animate({transform: 'translateX(0)'}, duration)
        ]
      `,
      'file:///test/animations.eligian'
    );

    // utils.eligian - library with safeSelect, safeAddClass, fadeIn
    await createLibraryDocument(
      ctx,
      `
        library utils

        action safeSelect(selector: string) [
          selectElement(selector)
        ]

        action safeAddClass(selector: string, className: string) [
          selectElement(selector)
          addClass(className)
        ]

        action fadeIn(selector: string, duration: number) [
          selectElement(selector)
          animate({opacity: 1}, duration)
        ]
      `,
      'file:///test/utils.eligian'
    );
  });

  /**
   * Helper: Parse DSL code with a document URI in the same directory as library files
   * This enables relative imports like `import { fadeIn } from "./animations.eligian"` to resolve correctly
   */
  async function parseDSL(
    code: string,
    documentUri = 'file:///test/main.eligian'
  ): Promise<Program> {
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

  // T039: Test imported actions are merged into program AST
  test('imported actions are merged into program action registry', async () => {
    const code = `
      import { fadeIn, fadeOut } from "./animations.eligian"

      action localAction(selector: string) [
        selectElement(selector)
      ]

      timeline "Test" in ".container" using raf {
        at 0s..2s fadeIn("#box", 1000)
        at 2s..4s localAction("#box")
        at 4s..6s fadeOut("#box", 1000)
      }
    `;

    const program = await parseDSL(code, 'file:///test/test1.eligian');
    const result = await Effect.runPromise(transformAST(program));

    // Should have 3 custom actions: fadeIn (imported), fadeOut (imported), localAction (local)
    expect(result.config.actions).toBeDefined();
    const actionNames = result.config.actions.map(a => a.name);
    expect(actionNames).toContain('fadeIn');
    expect(actionNames).toContain('fadeOut');
    expect(actionNames).toContain('localAction');
  });

  test('multiple imports from different libraries are merged correctly', async () => {
    const code = `
      import { fadeIn } from "./animations.eligian"
      import { safeSelect } from "./utils.eligian"

      timeline "Test" in ".container" using raf {
        at 0s..2s safeSelect("#box")
        at 2s..4s fadeIn("#box", 1000)
      }
    `;

    const program = await parseDSL(code, 'file:///test/test2.eligian');
    const result = await Effect.runPromise(transformAST(program));

    // Should have both imported actions in the action registry
    expect(result.config.actions).toBeDefined();
    const actionNames = result.config.actions.map(a => a.name);
    expect(actionNames).toContain('fadeIn');
    expect(actionNames).toContain('safeSelect');
  });

  test('imported actions work alongside local actions', async () => {
    const code = `
      import { fadeIn } from "./animations.eligian"

      action customAnimation(selector: string) [
        selectElement(selector)
        addClass("animated")
      ]

      timeline "Test" in ".container" using raf {
        at 0s..2s fadeIn("#box", 1000)
        at 2s..4s customAnimation("#box")
      }
    `;

    const program = await parseDSL(code, 'file:///test/test3.eligian');
    const result = await Effect.runPromise(transformAST(program));

    // Should have both imported and local actions
    expect(result.config.actions).toBeDefined();
    const actionNames = result.config.actions.map(a => a.name);
    expect(actionNames).toContain('fadeIn');
    expect(actionNames).toContain('customAnimation');
  });

  // T040: Test aliased actions use alias name in compilation
  test('aliased actions use alias name in compilation', async () => {
    const code = `
      import { fadeIn as fade } from "./animations.eligian"

      timeline "Test" in ".container" using raf {
        at 0s..2s fade("#box", 1000)
      }
    `;

    const program = await parseDSL(code, 'file:///test/test4.eligian');
    const result = await Effect.runPromise(transformAST(program));

    // Should use the ALIAS name (fade) in the custom actions registry
    expect(result.config.actions).toBeDefined();
    const actionNames = result.config.actions.map(a => a.name);
    expect(actionNames).toContain('fade');
    expect(actionNames).not.toContain('fadeIn');

    // Timeline should reference the alias name
    const timeline = result.config.timelines[0];
    expect(timeline.timelineActions).toBeDefined();
    // Check that timelineActions contain requestAction operations referencing 'fade'
    const hasFadeReference = timeline.timelineActions?.some((ta: any) =>
      ta.startOperations?.some(
        (op: any) => op.systemName === 'requestAction' && op.operationData?.systemName === 'fade'
      )
    );
    expect(hasFadeReference).toBe(true);
  });

  test('multiple aliased imports use their respective aliases', async () => {
    const code = `
      import { fadeIn as animFade } from "./animations.eligian"
      import { fadeIn as utilFade } from "./utils.eligian"

      timeline "Test" in ".container" using raf {
        at 0s..2s animFade("#box", 1000)
        at 2s..4s utilFade("#box", 500)
      }
    `;

    const program = await parseDSL(code, 'file:///test/test5.eligian');
    const result = await Effect.runPromise(transformAST(program));

    // Should have both aliases in the custom actions registry
    expect(result.config.actions).toBeDefined();
    const actionNames = result.config.actions.map(a => a.name);
    expect(actionNames).toContain('animFade');
    expect(actionNames).toContain('utilFade');
    expect(actionNames).not.toContain('fadeIn');
  });

  test('aliased and non-aliased imports can coexist', async () => {
    const code = `
      import { fadeIn as fade, fadeOut } from "./animations.eligian"

      timeline "Test" in ".container" using raf {
        at 0s..2s fade("#box", 1000)
        at 2s..4s fadeOut("#box", 1000)
      }
    `;

    const program = await parseDSL(code, 'file:///test/test6.eligian');
    const result = await Effect.runPromise(transformAST(program));

    // Should have both the alias and the original name
    expect(result.config.actions).toBeDefined();
    const actionNames = result.config.actions.map(a => a.name);
    expect(actionNames).toContain('fade');
    expect(actionNames).toContain('fadeOut');
    expect(actionNames).not.toContain('fadeIn');
  });
});
