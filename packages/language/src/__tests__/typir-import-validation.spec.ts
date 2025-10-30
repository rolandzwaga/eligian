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

      timeline "test" in "#app" using raf {}
    `);

    expect(document.parseResult.parserErrors).toHaveLength(0);
    // TODO: Verify ImportType inference and hover display
  });

  test('T013-2: Error on duplicate layout imports', async () => {
    const document = await parse(`
      layout './layout1.html'
      layout './layout2.html'

      timeline "test" in "#app" using raf {}
    `);

    expect(document.parseResult.parserErrors).toHaveLength(0);
    // TODO: Verify Typir validation error for duplicate imports
  });

  test('T013-3: Warning on type mismatch (import media as html)', async () => {
    const document = await parse(`
      import myVideo from './intro.mp4' as html

      timeline "test" in "#app" using raf {}
    `);

    expect(document.parseResult.parserErrors).toHaveLength(0);
    // TODO: Verify Typir validation warning for type mismatch
  });

  test('T013-4: Hover shows "Import<html>" for explicit override', async () => {
    const document = await parse(`
      import data from './data.json' as html

      timeline "test" in "#app" using raf {}
    `);

    expect(document.parseResult.parserErrors).toHaveLength(0);
    // TODO: Verify ImportType with explicit override
  });

  test('T013-5: Named import type inference from extension', async () => {
    const document = await parse(`
      import myStyles from './theme.css'

      timeline "test" in "#app" using raf {}
    `);

    expect(document.parseResult.parserErrors).toHaveLength(0);
    // TODO: Verify ImportType inferred from file extension
  });
});
