/**
 * Import Parsing Tests (Feature 023 - User Story 2)
 *
 * Tests parsing of library import statements with ES6-style syntax.
 * These tests verify the grammar correctly parses import syntax without validation.
 */

import { beforeAll, describe, expect, test } from 'vitest';
import type { LibraryImport, Program } from '../generated/ast.js';
import { createTestContext, type TestContext } from './test-helpers.js';

describe('Import Parsing', () => {
  let ctx: TestContext;

  beforeAll(() => {
    ctx = createTestContext();
  });

  // T029: Test single action import syntax
  test('parses single action import', async () => {
    const code = `
      import { fadeIn } from "./animations.eligian"

      timeline "Test" in ".container" using raf {
        at 0s..5s fadeIn("#box", 1000)
      }
    `;

    const document = await ctx.parse(code);
    expect(document.parseResult.parserErrors).toHaveLength(0);

    const program = document.parseResult.value as Program;
    const imports = program.statements.filter(
      stmt => stmt.$type === 'LibraryImport'
    ) as LibraryImport[];

    expect(imports).toHaveLength(1);
    expect(imports[0].path).toBe('./animations.eligian');
    expect(imports[0].actions).toHaveLength(1);
    expect(imports[0].actions[0].action.$refText).toBe('fadeIn');
    expect(imports[0].actions[0].alias).toBeUndefined();
  });

  // T030: Test multiple action imports from same library
  test('parses multiple action imports from same library', async () => {
    const code = `
      import { fadeIn, fadeOut, slideIn } from "./animations.eligian"

      timeline "Test" in ".container" using raf {
        at 0s..5s fadeIn("#box", 1000)
      }
    `;

    const document = await ctx.parse(code);
    expect(document.parseResult.parserErrors).toHaveLength(0);

    const program = document.parseResult.value as Program;
    const imports = program.statements.filter(
      stmt => stmt.$type === 'LibraryImport'
    ) as LibraryImport[];

    expect(imports).toHaveLength(1);
    expect(imports[0].actions).toHaveLength(3);
    expect(imports[0].actions[0].action.$refText).toBe('fadeIn');
    expect(imports[0].actions[1].action.$refText).toBe('fadeOut');
    expect(imports[0].actions[2].action.$refText).toBe('slideIn');
  });

  test('parses multiple import statements from different libraries', async () => {
    const code = `
      import { fadeIn, fadeOut } from "./animations.eligian"
      import { safeSelect, safeAddClass } from "./utils.eligian"

      timeline "Test" in ".container" using raf {
        at 0s..5s fadeIn("#box", 1000)
      }
    `;

    const document = await ctx.parse(code);
    expect(document.parseResult.parserErrors).toHaveLength(0);

    const program = document.parseResult.value as Program;
    const imports = program.statements.filter(
      stmt => stmt.$type === 'LibraryImport'
    ) as LibraryImport[];

    expect(imports).toHaveLength(2);
    expect(imports[0].path).toBe('./animations.eligian');
    expect(imports[0].actions).toHaveLength(2);
    expect(imports[1].path).toBe('./utils.eligian');
    expect(imports[1].actions).toHaveLength(2);
  });

  // T031: Test import with alias syntax
  test('parses import with alias', async () => {
    const code = `
      import { fadeIn as fade } from "./animations.eligian"

      timeline "Test" in ".container" using raf {
        at 0s..5s fade("#box", 1000)
      }
    `;

    const document = await ctx.parse(code);
    expect(document.parseResult.parserErrors).toHaveLength(0);

    const program = document.parseResult.value as Program;
    const imports = program.statements.filter(
      stmt => stmt.$type === 'LibraryImport'
    ) as LibraryImport[];

    expect(imports).toHaveLength(1);
    expect(imports[0].actions).toHaveLength(1);
    expect(imports[0].actions[0].action.$refText).toBe('fadeIn');
    expect(imports[0].actions[0].alias).toBe('fade');
  });

  test('parses mixed aliased and non-aliased imports', async () => {
    const code = `
      import { fadeIn as fade, fadeOut, slideIn as slide } from "./animations.eligian"

      timeline "Test" in ".container" using raf {
        at 0s..5s fade("#box", 1000)
      }
    `;

    const document = await ctx.parse(code);
    expect(document.parseResult.parserErrors).toHaveLength(0);

    const program = document.parseResult.value as Program;
    const imports = program.statements.filter(
      stmt => stmt.$type === 'LibraryImport'
    ) as LibraryImport[];

    expect(imports).toHaveLength(1);
    expect(imports[0].actions).toHaveLength(3);
    expect(imports[0].actions[0].action.$refText).toBe('fadeIn');
    expect(imports[0].actions[0].alias).toBe('fade');
    expect(imports[0].actions[1].action.$refText).toBe('fadeOut');
    expect(imports[0].actions[1].alias).toBeUndefined();
    expect(imports[0].actions[2].action.$refText).toBe('slideIn');
    expect(imports[0].actions[2].alias).toBe('slide');
  });

  // T032: Test import path extraction
  test('parses import path correctly', async () => {
    const code = `
      import { fadeIn } from "./animations.eligian"
    `;

    const document = await ctx.parse(code);
    expect(document.parseResult.parserErrors).toHaveLength(0);

    const program = document.parseResult.value as Program;
    const imports = program.statements.filter(
      stmt => stmt.$type === 'LibraryImport'
    ) as LibraryImport[];

    expect(imports[0].path).toBe('./animations.eligian');
  });

  test('parses nested library path', async () => {
    const code = `
      import { fadeIn } from "../../shared/animations.eligian"
    `;

    const document = await ctx.parse(code);
    expect(document.parseResult.parserErrors).toHaveLength(0);

    const program = document.parseResult.value as Program;
    const imports = program.statements.filter(
      stmt => stmt.$type === 'LibraryImport'
    ) as LibraryImport[];

    expect(imports[0].path).toBe('../../shared/animations.eligian');
  });

  test('parses absolute library path', async () => {
    const code = `
      import { fadeIn } from "/workspace/libraries/animations.eligian"
    `;

    const document = await ctx.parse(code);
    expect(document.parseResult.parserErrors).toHaveLength(0);

    const program = document.parseResult.value as Program;
    const imports = program.statements.filter(
      stmt => stmt.$type === 'LibraryImport'
    ) as LibraryImport[];

    expect(imports[0].path).toBe('/workspace/libraries/animations.eligian');
  });
});
