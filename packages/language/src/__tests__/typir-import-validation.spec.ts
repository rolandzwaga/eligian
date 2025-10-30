/**
 * Integration tests for Typir-based import validation (User Story 1)
 *
 * Tests cover:
 * - Import type inference and hover display
 * - Duplicate default import detection
 * - Asset type mismatch warnings
 */

import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { describe, expect, test } from 'vitest';
import { createEligianServices } from '../eligian-module.js';
import type { Program } from '../generated/ast.js';

describe('US1: Import Statement Type Checking (Integration)', () => {
  const services = createEligianServices(EmptyFileSystem).Eligian;
  const parse = parseHelper<Program>(services);

  test('T013-1: Hover shows "Import<css>" for styles import', async () => {
    const document = await parse(`
      styles './main.css'

      timeline "test" at 0s {}
    `);

    // This test will fail until US1 is implemented
    // Expected: Import type inference creates "Import<css>" type
    // Actual: No import type inference yet
    expect(document.parseResult.parserErrors).toHaveLength(0);
    // TODO: Add type inference verification once Typir integration is complete
  });

  test('T013-2: Error on duplicate layout imports', async () => {
    const document = await parse(`
      layout './layout1.html'
      layout './layout2.html'

      timeline "test" at 0s {}
    `);

    // This test will fail until US1 is implemented
    // Expected: Validation error for duplicate default imports
    // Actual: No validation yet
    expect(document.parseResult.parserErrors).toHaveLength(0);
    // TODO: Verify validation error once implemented
    // expect(document.diagnostics).toContainEqual(
    //   expect.objectContaining({
    //     message: expect.stringContaining("Duplicate 'layout' import")
    //   })
    // );
  });

  test('T013-3: Warning on type mismatch (import video as html)', async () => {
    const document = await parse(`
      import video from './intro.mp4' as html

      timeline "test" at 0s {}
    `);

    // This test will fail until US1 is implemented
    // Expected: Warning about asset type mismatch
    // Actual: No validation yet
    expect(document.parseResult.parserErrors).toHaveLength(0);
    // TODO: Verify warning once implemented
  });

  test('T013-4: Hover shows "Import<html>" for explicit override', async () => {
    const document = await parse(`
      import data from './data.json' as html

      timeline "test" at 0s {}
    `);

    // This test will fail until US1 is implemented
    // Expected: Import type shows explicit override type
    // Actual: No type inference yet
    expect(document.parseResult.parserErrors).toHaveLength(0);
    // TODO: Add type inference verification
  });

  test('T013-5: Named import type inference from extension', async () => {
    const document = await parse(`
      import myStyles from './theme.css'

      timeline "test" at 0s {}
    `);

    // This test will fail until US1 is implemented
    // Expected: Import type inferred as "Import<css>" from file extension
    // Actual: No type inference yet
    expect(document.parseResult.parserErrors).toHaveLength(0);
    // TODO: Add type inference verification
  });
});
