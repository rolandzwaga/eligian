import { describe, test, expect, beforeAll, beforeEach } from 'vitest';
import type { TestContext } from './test-helpers.js';
import { createTestContext, setupCSSRegistry } from './test-helpers.js';

describe('Operation Validation', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = createTestContext();
  });

  beforeEach(() => {
    // Setup CSS registry with all classes/IDs used in tests to avoid CSS validation errors
    setupCSSRegistry(ctx, 'file:///test.css', {
      classes: ['active', 'test'],
      ids: ['app', 'test'],
    });
  });

  describe('Unknown operation detection', () => {
    test('should error on completely unknown operation', async () => {
      const { diagnostics } = await ctx.parseAndValidate(`
        styles "./test.css"

        timeline "Test" in "#app" using raf {
          at 0s..1s [
            thisOperationDoesNotExist()
          ] []
        }
      `);

      const errors = diagnostics.filter((d) => d.severity === 1);
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('Unknown operation');
      expect(errors[0].message).toContain('thisOperationDoesNotExist');
    });

    test('should error on setText (common mistake)', async () => {
      const { diagnostics } = await ctx.parseAndValidate(`
        styles "./test.css"

        timeline "Test" in "#app" using raf {
          at 0s..1s [
            selectElement("#test")
            setText("hello")
          ] []
        }
      `);

      const errors = diagnostics.filter((d) => d.severity === 1);
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('Unknown operation');
      expect(errors[0].message).toContain('setText');
    });

    test('should error on hasElement (common mistake)', async () => {
      const { diagnostics } = await ctx.parseAndValidate(`
        styles "./test.css"

        action test() [
          hasElement("#test")
          log("found")
        ]

        timeline "T" in "#app" using raf {
          at 0s..1s test()
        }
      `);

      const errors = diagnostics.filter((d) => d.severity === 1);

      // Debug: show all errors
      if (errors.length !== 1) {
        console.log(`hasElement test found ${errors.length} errors:`);
        for (const err of errors) {
          console.log(`  - ${err.message}`);
        }
      }

      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('Unknown operation');
      expect(errors[0].message).toContain('hasElement');
    });

    test('should error on hasClass (common mistake)', async () => {
      const { diagnostics } = await ctx.parseAndValidate(`
        styles "./test.css"

        action test() [
          selectElement("#test")
          hasClass("active")
          log("active")
        ]

        timeline "T" in "#app" using raf {
          at 0s..1s test()
        }
      `);

      const errors = diagnostics.filter((d) => d.severity === 1);
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('Unknown operation');
      expect(errors[0].message).toContain('hasClass');
    });

    test('should NOT error on valid operations', async () => {
      const { diagnostics } = await ctx.parseAndValidate(`
        styles "./test.css"

        timeline "Test" in "#app" using raf {
          at 0s..1s [
            selectElement("#test")
            addClass("active")
            animate({opacity: 1}, 500)
            setElementContent({template: "Hello"})
          ] []
        }
      `);

      const errors = diagnostics.filter((d) => d.severity === 1);

      // Debug: print actual errors if any
      if (errors.length > 0) {
        console.log('Unexpected errors found:');
        for (const err of errors) {
          console.log(`  - ${err.message} (code: ${err.code})`);
        }
      }

      expect(errors).toHaveLength(0);
    });
  });

  describe('Library file operation validation', () => {
    test('should error on invalid operations in library files', async () => {
      const { diagnostics } = await ctx.parseAndValidate(`
        library broken

        action badAction() [
          thisOperationDoesNotExist()
          setText("invalid")
        ]
      `);

      const errors = diagnostics.filter((d) => d.severity === 1);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.message.includes('thisOperationDoesNotExist'))).toBe(true);
    });

    test('should validate operations in library files same as regular files', async () => {
      const { diagnostics } = await ctx.parseAndValidate(`
        library utils

        action safeAddClass(selector: string, className: string) [
          selectElement(selector)
          addClass(className)
        ]
      `);

      const errors = diagnostics.filter((d) => d.severity === 1);
      expect(errors).toHaveLength(0);
    });
  });

  describe('Operation suggestions', () => {
    test('should suggest similar operations for typos', async () => {
      const { diagnostics } = await ctx.parseAndValidate(`
        styles "./test.css"

        timeline "Test" in "#app" using raf {
          at 0s..1s [
            adClass("test")
          ] []
        }
      `);

      const errors = diagnostics.filter((d) => d.severity === 1);
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('addClass');
    });
  });
});
