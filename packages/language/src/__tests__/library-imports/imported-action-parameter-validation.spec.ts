/**
 * Tests for parameter count validation of imported library actions (Feature 032 fix)
 *
 * Bug Fix: Validator was not checking parameter counts for imported actions,
 * only for local actions and built-in operations. This caused runtime errors
 * when calling imported actions with wrong argument counts.
 *
 * Location: eligian-validator.ts:checkParameterCount()
 */

import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import * as compilerIntegration from '../../asset-loading/compiler-integration.js';
import {
  CSS_FIXTURES,
  createLibraryDocument,
  createTestContextWithMockFS,
  DiagnosticSeverity,
  MockAssetLoader,
  setupCSSRegistry,
  type TestContext,
} from '../test-helpers.js';

describe('Imported Action Parameter Validation (Feature 032 Fix)', () => {
  let ctx: TestContext;
  let testCounter = 0;
  let mockAssetLoader: MockAssetLoader;

  // Helper to parse and validate with document URI support (for library imports)
  const parseAndValidateWithUri = async (code: string) => {
    // Use unique document URI for each test to avoid Langium document cache collisions
    const documentUri = `file:///test/main-${++testCounter}.eligian`;

    // Create a mock styles.css file in the mock FS (referenced by tests)
    if (ctx.mockFs) {
      ctx.mockFs.writeFile('file:///test/styles.css', '.container { display: block; }');
    }

    const document = await ctx.parse(code, { documentUri });
    await ctx.services.shared.workspace.DocumentBuilder.build([document], {
      validation: true,
    });

    const diagnostics = document.diagnostics ?? [];
    const errors = diagnostics.filter(d => d.severity === DiagnosticSeverity.Error);

    return { document, diagnostics, errors };
  };

  beforeAll(async () => {
    ctx = await createTestContextWithMockFS();

    // Create mock asset loader using the mock file system
    mockAssetLoader = new MockAssetLoader(ctx.mockFs!);

    // Mock loadProgramAssets to use our mock asset loader
    vi.spyOn(compilerIntegration, 'loadProgramAssets').mockImplementation(
      (program, sourceFilePath, service) => {
        // Call original implementation with injected mock asset loader
        return compilerIntegration.loadProgramAssets(
          program,
          sourceFilePath,
          service,
          mockAssetLoader
        );
      }
    );

    // Create library with actions of various parameter counts
    await createLibraryDocument(
      ctx,
      `library animations

      action fadeIn(selector: string, duration: number) [
        selectElement(selector)
        animate({opacity: 1}, duration)
      ]

      action fadeOut(selector: string, duration: number) [
        selectElement(selector)
        animate({opacity: 0}, duration)
      ]

      action noParams() [
        log("test")
      ]

      action oneParam(value: number) [
        wait(value)
      ]

      action threeParams(a: string, b: number, c: boolean) [
        log(a)
        wait(b)
      ]`,
      'file:///test/animations.eligian'
    );
  });

  beforeEach(() => {
    // Setup CSS registry with 'container' class for timeline container validation
    // Use file:///test/styles.css because tests use "./styles.css" which resolves
    // relative to document URI (file:///test/main-N.eligian)
    setupCSSRegistry(ctx, 'file:///test/styles.css', {
      classes: ['container', ...CSS_FIXTURES.common.classes],
      ids: CSS_FIXTURES.common.ids,
    });
  });

  // T001: Valid imported action calls with correct argument counts
  test('should accept imported action with correct argument count (2 args)', async () => {
    const code = `
      import { fadeIn } from "./animations.eligian"
      styles "./styles.css"

      timeline "test" in ".container" using raf {
        at 0s..2s fadeIn("#box", 1000)
      }
    `;

    const { errors } = await parseAndValidateWithUri(code);

    if (errors.length > 0) {
      console.error('Unexpected errors:');
      for (const e of errors) {
        console.error(`  - ${e.message} (code: ${e.data?.code})`);
      }
    }

    expect(errors).toHaveLength(0);
  });

  // T002: Valid imported action with 0 parameters
  test('should accept imported action with correct argument count (0 args)', async () => {
    const code = `
      import { noParams } from "./animations.eligian"
      styles "./styles.css"

      timeline "test" in ".container" using raf {
        at 0s..2s noParams()
      }
    `;

    const { errors } = await parseAndValidateWithUri(code);
    expect(errors).toHaveLength(0);
  });

  // T003: Valid imported action with 3 parameters
  test('should accept imported action with correct argument count (3 args)', async () => {
    const code = `
      import { threeParams } from "./animations.eligian"
      styles "./styles.css"

      timeline "test" in ".container" using raf {
        at 0s..2s threeParams("test", 500, true)
      }
    `;

    const { errors } = await parseAndValidateWithUri(code);
    expect(errors).toHaveLength(0);
  });

  // T004: Invalid - Too few arguments
  test('should reject imported action with too few arguments (1 instead of 2)', async () => {
    const code = `
      import { fadeIn } from "./animations.eligian"
      styles "./styles.css"

      timeline "test" in ".container" using raf {
        at 0s..2s fadeIn("#box")
      }
    `;

    const { diagnostics } = await parseAndValidateWithUri(code);

    // Filter for parameter count errors by message pattern (code field is not preserved)
    const errors = diagnostics.filter(
      d =>
        d.severity === DiagnosticSeverity.Error &&
        d.message.includes("Action 'fadeIn' expects 2 argument(s) but got 1")
    );

    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('Expected: selector, duration');
  });

  // T005: Invalid - Too many arguments
  test('should reject imported action with too many arguments (3 instead of 2)', async () => {
    const code = `
      import { fadeOut } from "./animations.eligian"
      styles "./styles.css"

      timeline "test" in ".container" using raf {
        at 0s..2s fadeOut("#box", 1000, "extra")
      }
    `;

    const { diagnostics } = await parseAndValidateWithUri(code);
    const errors = diagnostics.filter(
      d =>
        d.severity === DiagnosticSeverity.Error &&
        d.message.includes("Action 'fadeOut' expects 2 argument(s) but got 3")
    );

    expect(errors).toHaveLength(1);
  });

  // T006: Invalid - Arguments provided when none expected
  test('should reject imported action with arguments when none expected', async () => {
    const code = `
      import { noParams } from "./animations.eligian"
      styles "./styles.css"

      timeline "test" in ".container" using raf {
        at 0s..2s noParams("unexpected")
      }
    `;

    const { diagnostics } = await parseAndValidateWithUri(code);
    const errors = diagnostics.filter(
      d =>
        d.severity === DiagnosticSeverity.Error &&
        d.message.includes("Action 'noParams' expects 0 argument(s) but got 1")
    );

    expect(errors).toHaveLength(1);
  });

  // T007: Valid - Multiple imported actions with correct counts
  test('should validate multiple imported actions correctly', async () => {
    const code = `
      import { fadeIn, fadeOut, noParams } from "./animations.eligian"
      styles "./styles.css"

      timeline "test" in ".container" using raf {
        at 0s..2s fadeIn("#box", 1000)
        at 2s..4s fadeOut("#box", 500)
        at 4s..6s noParams()
      }
    `;

    const { errors } = await parseAndValidateWithUri(code);
    expect(errors).toHaveLength(0);
  });

  // T008: Invalid - Multiple errors for different imported actions
  test('should detect multiple parameter count errors', async () => {
    const code = `
      import { fadeIn, oneParam } from "./animations.eligian"
      styles "./styles.css"

      timeline "test" in ".container" using raf {
        at 0s..2s fadeIn("#box")
        at 2s..4s oneParam()
      }
    `;

    const { diagnostics } = await parseAndValidateWithUri(code);
    const errors = diagnostics.filter(
      d =>
        d.severity === DiagnosticSeverity.Error &&
        (d.message.includes("Action 'fadeIn' expects 2 argument(s) but got 1") ||
          d.message.includes("Action 'oneParam' expects 1 argument(s) but got 0"))
    );

    expect(errors).toHaveLength(2);
    expect(errors[0].message).toContain('fadeIn');
    expect(errors[1].message).toContain('oneParam');
  });

  // T009: Valid - Imported action with alias
  test('should validate aliased imported action parameter count', async () => {
    const code = `
      import { fadeIn as customFadeIn } from "./animations.eligian"
      styles "./styles.css"

      timeline "test" in ".container" using raf {
        at 0s..2s customFadeIn("#box", 1000)
      }
    `;

    const { errors } = await parseAndValidateWithUri(code);

    // Debug: Print all errors
    if (errors.length > 0) {
      console.error('=== UNEXPECTED ERRORS ===');
      for (const e of errors) {
        console.error(`  ${e.message}`);
      }
    }

    expect(errors).toHaveLength(0);
  });

  // T010: Invalid - Aliased imported action with wrong count
  test('should reject aliased imported action with wrong argument count', async () => {
    const code = `
      import { fadeIn as customFadeIn } from "./animations.eligian"
      styles "./styles.css"

      timeline "test" in ".container" using raf {
        at 0s..2s customFadeIn("#box")
      }
    `;

    const { diagnostics } = await parseAndValidateWithUri(code);

    // Debug: Print all diagnostics
    console.error('=== T010 ALL DIAGNOSTICS ===');
    for (const d of diagnostics) {
      if (d.severity === DiagnosticSeverity.Error) {
        console.error(`  [ERROR] ${d.message}`);
      }
    }

    const errors = diagnostics.filter(
      d =>
        d.severity === DiagnosticSeverity.Error &&
        d.message.includes('expects 2 argument(s) but got 1')
    );

    expect(errors).toHaveLength(1);
  });

  // T011: Valid - Imported action called in control flow
  test('should validate imported action parameter count in control flow', async () => {
    const code = `
      import { fadeIn } from "./animations.eligian"
      styles "./styles.css"

      action wrapper() [
        for (item in [".box1", ".box2"]) {
          fadeIn(@@currentItem, 1000)
        }
      ]

      timeline "test" in ".container" using raf {
        at 0s..2s wrapper()
      }
    `;

    const { errors } = await parseAndValidateWithUri(code);
    expect(errors).toHaveLength(0);
  });

  // T012: Invalid - Imported action with wrong count in control flow
  test('should reject imported action with wrong count in control flow', async () => {
    const code = `
      import { fadeIn } from "./animations.eligian"
      styles "./styles.css"

      action wrapper() [
        for (item in [".box1", ".box2"]) {
          fadeIn(@@currentItem)
        }
      ]

      timeline "test" in ".container" using raf {
        at 0s..2s wrapper()
      }
    `;

    const { diagnostics } = await parseAndValidateWithUri(code);
    const errors = diagnostics.filter(
      d =>
        d.severity === DiagnosticSeverity.Error &&
        d.message.includes("Action 'fadeIn' expects 2 argument(s) but got 1")
    );

    expect(errors).toHaveLength(1);
  });
});
