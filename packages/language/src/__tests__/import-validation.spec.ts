/**
 * Import Validation Tests (Feature 023 - User Story 2)
 *
 * Tests validation rules for library imports:
 * - Library file must exist
 * - Imported actions must exist in library
 * - Imports must not conflict with local actions
 * - No duplicate imports from multiple libraries
 * - Aliases resolve name conflicts
 */

import { beforeAll, describe, expect, test } from 'vitest';
import { createTestContext, type TestContext } from './test-helpers.js';

describe('Import Validation', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  // T033: Test error when library file not found
  test('rejects import from non-existent library file', async () => {
    const code = `
      import { fadeIn } from "./non-existent.eligian"

      timeline "Test" in ".container" using raf {
        at 0s..5s fadeIn("#box", 1000)
      }
    `;

    const { errors } = await ctx.parseAndValidate(code);
    expect(errors.length).toBeGreaterThan(0);
    const importError = errors.find(e => e.code === 'import_file_not_found');
    expect(importError).toBeDefined();
    expect(importError?.message).toContain('./non-existent.eligian');
  });

  test('rejects import with invalid file path', async () => {
    const code = `
      import { fadeIn } from "not-a-relative-path.eligian"

      timeline "Test" in ".container" using raf {
        at 0s..5s fadeIn("#box", 1000)
      }
    `;

    const { errors } = await ctx.parseAndValidate(code);
    expect(errors.length).toBeGreaterThan(0);
    const importError = errors.find(e => e.code === 'import_file_not_found');
    expect(importError).toBeDefined();
  });

  // T034: Test error when imported action doesn't exist
  test('rejects import of non-existent action from library', async () => {
    const code = `
      import { nonExistentAction } from "./animations.eligian"

      timeline "Test" in ".container" using raf {
        at 0s..5s nonExistentAction("#box")
      }
    `;

    const { errors } = await ctx.parseAndValidate(code);
    expect(errors.length).toBeGreaterThan(0);
    const importError = errors.find(e => e.code === 'import_action_not_found');
    expect(importError).toBeDefined();
    expect(importError?.message).toContain('nonExistentAction');
  });

  test('suggests similar action names when import fails', async () => {
    const code = `
      import { fadIn } from "./animations.eligian"

      timeline "Test" in ".container" using raf {
        at 0s..5s fadIn("#box")
      }
    `;

    const { errors } = await ctx.parseAndValidate(code);
    expect(errors.length).toBeGreaterThan(0);
    const importError = errors.find(e => e.code === 'import_action_not_found');
    expect(importError).toBeDefined();
    expect(importError?.message).toContain('fadIn');
    // Should suggest 'fadeIn' as similar name
    expect(importError?.message.toLowerCase()).toContain('did you mean');
  });

  test('rejects import when multiple actions do not exist', async () => {
    const code = `
      import { validAction, invalidAction1, invalidAction2 } from "./animations.eligian"

      timeline "Test" in ".container" using raf {
        at 0s..5s validAction("#box")
      }
    `;

    const { errors } = await ctx.parseAndValidate(code);
    const importErrors = errors.filter(e => e.code === 'import_action_not_found');
    expect(importErrors.length).toBeGreaterThanOrEqual(2);
  });

  // T035: Test error when import conflicts with local action
  test('rejects import that conflicts with local action', async () => {
    const code = `
      import { fadeIn } from "./animations.eligian"

      action fadeIn(selector: string) [
        selectElement(selector)
      ]

      timeline "Test" in ".container" using raf {
        at 0s..5s fadeIn("#box", 1000)
      }
    `;

    const { errors } = await ctx.parseAndValidate(code);
    expect(errors.length).toBeGreaterThan(0);
    const collisionError = errors.find(e => e.code === 'import_name_collision');
    expect(collisionError).toBeDefined();
    expect(collisionError?.message).toContain('fadeIn');
    expect(collisionError?.message.toLowerCase()).toContain('conflict');
  });

  test('rejects multiple imports that conflict with local actions', async () => {
    const code = `
      import { fadeIn, fadeOut } from "./animations.eligian"

      action fadeIn(selector: string) [
        selectElement(selector)
      ]

      action fadeOut(selector: string) [
        selectElement(selector)
      ]

      timeline "Test" in ".container" using raf {
        at 0s..5s fadeIn("#box")
      }
    `;

    const { errors } = await ctx.parseAndValidate(code);
    const collisionErrors = errors.filter(e => e.code === 'import_name_collision');
    expect(collisionErrors.length).toBeGreaterThanOrEqual(2);
  });

  // T036: Test error when duplicate imports from multiple libraries
  test('rejects duplicate imports from different libraries', async () => {
    const code = `
      import { fadeIn } from "./animations.eligian"
      import { fadeIn } from "./utils.eligian"

      timeline "Test" in ".container" using raf {
        at 0s..5s fadeIn("#box", 1000)
      }
    `;

    const { errors } = await ctx.parseAndValidate(code);
    expect(errors.length).toBeGreaterThan(0);
    const collisionError = errors.find(e => e.code === 'import_name_collision');
    expect(collisionError).toBeDefined();
    expect(collisionError?.message).toContain('fadeIn');
  });

  test('rejects duplicate imports within same import statement', async () => {
    const code = `
      import { fadeIn, fadeIn } from "./animations.eligian"

      timeline "Test" in ".container" using raf {
        at 0s..5s fadeIn("#box")
      }
    `;

    const { errors } = await ctx.parseAndValidate(code);
    expect(errors.length).toBeGreaterThan(0);
    const collisionError = errors.find(e => e.code === 'import_name_collision');
    expect(collisionError).toBeDefined();
  });

  // T037: Test alias resolves name conflicts
  test('accepts aliased import that resolves conflict with local action', async () => {
    const code = `
      import { fadeIn as fade } from "./animations.eligian"

      action fadeIn(selector: string) [
        selectElement(selector)
      ]

      timeline "Test" in ".container" using raf {
        at 0s..5s fade("#box", 1000)
        at 5s..10s fadeIn("#box")
      }
    `;

    const { errors } = await ctx.parseAndValidate(code);
    const collisionErrors = errors.filter(e => e.code === 'import_name_collision');
    expect(collisionErrors).toHaveLength(0);
  });

  test('accepts aliased imports that resolve conflicts between libraries', async () => {
    const code = `
      import { fadeIn as animFade } from "./animations.eligian"
      import { fadeIn as utilFade } from "./utils.eligian"

      timeline "Test" in ".container" using raf {
        at 0s..5s animFade("#box", 1000)
        at 5s..10s utilFade("#box", 500)
      }
    `;

    const { errors } = await ctx.parseAndValidate(code);
    const collisionErrors = errors.filter(e => e.code === 'import_name_collision');
    expect(collisionErrors).toHaveLength(0);
  });

  test('rejects aliased import when alias conflicts with local action', async () => {
    const code = `
      import { fadeIn as localAction } from "./animations.eligian"

      action localAction(selector: string) [
        selectElement(selector)
      ]

      timeline "Test" in ".container" using raf {
        at 0s..5s localAction("#box")
      }
    `;

    const { errors } = await ctx.parseAndValidate(code);
    expect(errors.length).toBeGreaterThan(0);
    const collisionError = errors.find(e => e.code === 'import_name_collision');
    expect(collisionError).toBeDefined();
    expect(collisionError?.message).toContain('localAction');
  });

  test('rejects aliased import when alias conflicts with another import', async () => {
    const code = `
      import { fadeIn } from "./animations.eligian"
      import { slideIn as fadeIn } from "./utils.eligian"

      timeline "Test" in ".container" using raf {
        at 0s..5s fadeIn("#box")
      }
    `;

    const { errors } = await ctx.parseAndValidate(code);
    expect(errors.length).toBeGreaterThan(0);
    const collisionError = errors.find(e => e.code === 'import_name_collision');
    expect(collisionError).toBeDefined();
  });

  test('accepts program with valid imports and no conflicts', async () => {
    const code = `
      import { fadeIn, fadeOut } from "./animations.eligian"
      import { safeSelect } from "./utils.eligian"

      timeline "Test" in ".container" using raf {
        at 0s..5s fadeIn("#box", 1000)
        at 5s..10s fadeOut("#box", 1000)
      }
    `;

    const { errors } = await ctx.parseAndValidate(code);
    const importErrors = errors.filter(
      e =>
        e.code === 'import_file_not_found' ||
        e.code === 'import_action_not_found' ||
        e.code === 'import_name_collision'
    );
    expect(importErrors).toHaveLength(0);
  });
});
