import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import type { TestContext } from './test-helpers.js';
import {
  createTestContext,
  createTestContextWithMockFS,
  setupCSSRegistry,
  setupDocuments,
} from './test-helpers.js';

describe('Operation Validation', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = createTestContext();
  });

  beforeEach(() => {
    // Setup CSS registry with all classes/IDs used in tests to avoid CSS validation errors
    setupCSSRegistry(ctx, 'file:///test.css', {
      classes: ['active', 'test', 'container'],
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

      const errors = diagnostics.filter(d => d.severity === 1);
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

      const errors = diagnostics.filter(d => d.severity === 1);
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

      const errors = diagnostics.filter(d => d.severity === 1);

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

      const errors = diagnostics.filter(d => d.severity === 1);
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

      const errors = diagnostics.filter(d => d.severity === 1);

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

      const errors = diagnostics.filter(d => d.severity === 1);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.message.includes('thisOperationDoesNotExist'))).toBe(true);
    });

    test('should validate operations in library files same as regular files', async () => {
      const { diagnostics } = await ctx.parseAndValidate(`
        library utils

        action safeAddClass(selector: string, className: string) [
          selectElement(selector)
          addClass(className)
        ]
      `);

      const errors = diagnostics.filter(d => d.severity === 1);
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

      const errors = diagnostics.filter(d => d.severity === 1);
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('addClass');
    });
  });

  describe('Imported action validation', () => {
    // NOTE: These tests demonstrate using setupDocuments() for multi-file scenarios
    // KNOWN ISSUE: Tests skip due to:
    // 1. Import resolution fails in multi-file scenarios (fadeIn not found from library)
    // 2. CSS validation runs even without CSS imports, `.container` not in default registry
    // Feature 026: Fixed - checkTimelineOperationCall now checks imported actions
    test('should NOT error on valid imported action call', async () => {
      // Use the NEW setupDocuments() helper instead
      const testCtx = createTestContextWithMockFS();

      // Write CSS file to mock FS to avoid "file not found" errors
      if (testCtx.mockFs) {
        testCtx.mockFs.writeFile('file:///test/test.css', '.container { } #box { }');
      }

      // Setup CSS registry to avoid CSS validation errors
      setupCSSRegistry(testCtx, 'file:///test/test.css', {
        classes: ['container'],
        ids: ['box'],
      });

      const docs = await setupDocuments(testCtx, [
        {
          uri: 'file:///test/animations.eligian',
          content: `
            library animations
            action fadeIn(selector: string, duration: number) [
              selectElement(selector)
              animate({opacity: 1}, duration)
            ]
          `,
        },
        {
          uri: 'file:///test/main.eligian',
          content: `
            styles "./test.css"
            import { fadeIn } from "./animations.eligian"

            timeline "Test" in ".container" using raf {
              at 0s..5s fadeIn("#box", 1000)
            }
          `,
        },
      ]);

      const mainDoc = docs.get('file:///test/main.eligian')!;
      const allErrors = mainDoc.diagnostics?.filter(d => d.severity === 1) ?? [];

      // Filter out asset validation errors - we're testing action resolution, not asset validation
      const errors = allErrors.filter(err =>
        !err.message.includes('Asset file not found') &&
        !err.message.includes('Unknown CSS')
      );

      // Debug: show all errors
      if (errors.length !== 0) {
        console.log(`Found ${errors.length} errors:`);
        for (const err of errors) {
          console.log(`  - ${err.message} (code: ${err.code})`);
        }
      }

      expect(errors).toHaveLength(0);
    });

    test('should validate multiple imported actions', async () => {
      const testCtx = createTestContextWithMockFS();

      // Write CSS file to mock FS to avoid "file not found" errors
      testCtx.mockFs?.writeFile('file:///test/test.css', '#app { }');

      // Setup CSS registry to avoid CSS validation errors
      setupCSSRegistry(testCtx, 'file:///test/test.css', {
        ids: ['app'],
      });

      const docs = await setupDocuments(testCtx, [
        {
          uri: 'file:///test/animations.eligian',
          content: `
            library animations
            action fadeIn(selector: string, duration: number) [
              selectElement(selector)
              animate({opacity: 1}, duration)
            ]
            action fadeOut(selector: string, duration: number) [
              selectElement(selector)
              animate({opacity: 0}, duration)
            ]
          `,
        },
        {
          uri: 'file:///test/main.eligian',
          content: `
            styles "./test.css"
            import { fadeIn, fadeOut } from "./animations.eligian"

            action mySequence() [
              fadeIn("#app", 1000)
              fadeOut("#app", 500)
            ]

            timeline "Test" in "#app" using raf {
              at 0s..1s mySequence()
            }
          `,
        },
      ]);

      const mainDoc = docs.get('file:///test/main.eligian')!;
      const allErrors = mainDoc.diagnostics?.filter(d => d.severity === 1) ?? [];

      // Debug: show all errors
      if (allErrors.length !== 0) {
        console.log(`Found ${allErrors.length} errors:`);
        for (const err of allErrors) {
          console.log(`  - ${err.message} (code: ${err.code})`);
        }
      }

      // Filter out asset validation errors - we're testing action resolution, not asset validation
      const errors = allErrors.filter(err =>
        !err.message.includes('Asset file not found') &&
        !err.message.includes('Unknown CSS')
      );

      expect(errors).toHaveLength(0);
    });

    test('should validate mix of imported actions and builtin operations', async () => {
      const testCtx = createTestContextWithMockFS();

      // Write CSS file to mock FS to avoid "file not found" errors
      testCtx.mockFs?.writeFile('file:///test/test.css', '#app { }');

      // Setup CSS registry to avoid CSS validation errors
      setupCSSRegistry(testCtx, 'file:///test/test.css', {
        ids: ['app'],
      });

      const docs = await setupDocuments(testCtx, [
        {
          uri: 'file:///test/animations.eligian',
          content: `
            library animations
            action fadeIn(selector: string, duration: number) [
              selectElement(selector)
              animate({opacity: 1}, duration)
            ]
          `,
        },
        {
          uri: 'file:///test/main.eligian',
          content: `
            styles "./test.css"
            import { fadeIn } from "./animations.eligian"

            action enhanced() [
              fadeIn("#app", 1000)
              selectElement("#app")
              animate({opacity: 1}, 500)
            ]

            timeline "Test" in "#app" using raf {
              at 0s..1s enhanced()
            }
          `,
        },
      ]);

      const mainDoc = docs.get('file:///test/main.eligian')!;
      const allErrors = mainDoc.diagnostics?.filter(d => d.severity === 1) ?? [];

      // Debug: show all errors
      if (allErrors.length !== 0) {
        console.log(`Found ${allErrors.length} errors:`);
        for (const err of allErrors) {
          console.log(`  - ${err.message} (code: ${err.code})`);
        }
      }

      // Filter out asset validation errors - we're testing action resolution, not asset validation
      const errors = allErrors.filter(err =>
        !err.message.includes('Asset file not found') &&
        !err.message.includes('Unknown CSS')
      );

      expect(errors).toHaveLength(0);
    });

    test('should error on typo in imported action name', async () => {
      const { diagnostics } = await ctx.parseAndValidate(`
        styles "./test.css"

        import { fadeIn } from "./animations.eligian"

        action test() [
          fadein("#app", 1000)
        ]

        timeline "Demo" in "#app" using raf {
          at 0s..1s test()
        }
      `);

      const errors = diagnostics.filter(d => d.severity === 1);

      // Should have errors for: import reference error, library not found, unknown operation
      // The important part is that "fadein" (typo) is correctly flagged as unknown
      expect(errors.length).toBeGreaterThan(0);

      // Check that at least one error mentions "fadein" (the typo)
      const hasTypoError = errors.some(e => e.message.includes('fadein'));
      expect(hasTypoError).toBe(true);
    });
  });
});
