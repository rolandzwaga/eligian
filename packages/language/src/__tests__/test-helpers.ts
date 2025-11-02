/**
 * Shared test utilities for Eligian language tests
 *
 * This module provides shared test infrastructure to eliminate duplication across
 * test files. It includes:
 * - createTestContext(): Factory for test environment (services, parse, parseAndValidate)
 * - setupCSSRegistry(): Populate CSS registry with test fixtures
 * - CSS_FIXTURES: Predefined CSS test data
 * - DiagnosticSeverity: Enum for diagnostic severity levels
 * - getErrors() / getWarnings(): Filter diagnostics by severity
 *
 * ## Lifecycle Hook Best Practices
 *
 * When writing tests, follow these patterns for lifecycle hooks:
 *
 * ### beforeAll() - Expensive Setup (Once Per Suite)
 *
 * Use `beforeAll()` for expensive operations that can be shared across all tests
 * in a suite. This hook runs ONCE before any tests execute.
 *
 * **Best for:**
 * - Creating test context (service initialization)
 * - Loading large fixture files
 * - Setting up expensive resources
 *
 * **Example:**
 * ```typescript
 * let ctx: TestContext;
 *
 * beforeAll(() => {
 *   // Expensive: Initialize language services (Langium, Typir, CSS registry)
 *   ctx = createTestContext();
 * });
 *
 * test('test 1', async () => {
 *   // Use shared ctx - no re-initialization needed
 *   const { errors } = await ctx.parseAndValidate('...');
 * });
 * ```
 *
 * ### beforeEach() - Per-Test Isolation
 *
 * Use `beforeEach()` when tests modify shared state and need isolation.
 * This hook runs BEFORE EACH test.
 *
 * **Best for:**
 * - Resetting mock state between tests
 * - Creating fresh test data for each test
 * - Isolating tests that modify global state
 *
 * **Example:**
 * ```typescript
 * let ctx: TestContext;
 * let testData: SomeData;
 *
 * beforeAll(() => {
 *   ctx = createTestContext(); // Expensive setup - once
 * });
 *
 * beforeEach(() => {
 *   testData = createFreshData(); // Cheap isolation - each test
 * });
 * ```
 *
 * ### afterEach() - Cleanup and State Reset
 *
 * Use `afterEach()` to clean up after each test and prevent state leakage.
 * This hook runs AFTER EACH test.
 *
 * **Best for:**
 * - Restoring mocked functions (vi.restoreAllMocks())
 * - Clearing CSS registry state between tests
 * - Releasing resources created during tests
 *
 * **Example:**
 * ```typescript
 * let ctx: TestContext;
 *
 * beforeAll(() => {
 *   ctx = createTestContext();
 * });
 *
 * afterEach(() => {
 *   // Restore all mocked functions to original implementations
 *   vi.restoreAllMocks();
 *
 *   // Clear CSS registry to prevent cross-test contamination
 *   const cssRegistry = ctx.services.Eligian.css.CSSRegistry;
 *   // Note: CSSRegistry doesn't expose clearAll(), so clear per-file if needed
 * });
 * ```
 *
 * ### Common Anti-Patterns to Avoid
 *
 * ❌ **Creating test context in beforeEach()** - Wastes time re-initializing services
 * ```typescript
 * beforeEach(() => {
 *   ctx = createTestContext(); // TOO SLOW - runs for EVERY test
 * });
 * ```
 *
 * ❌ **Not cleaning up mocks** - Can cause test interference
 * ```typescript
 * test('test with mock', () => {
 *   vi.spyOn(someModule, 'someFunction').mockReturnValue('value');
 *   // Missing afterEach cleanup - mock persists to next test!
 * });
 * ```
 *
 * ❌ **Sharing mutable state without beforeEach()** - Tests become order-dependent
 * ```typescript
 * let counter = 0; // Shared across tests
 *
 * test('test 1', () => {
 *   counter++; // Modifies shared state
 * });
 *
 * test('test 2', () => {
 *   expect(counter).toBe(0); // FAILS if test 1 runs first!
 * });
 * ```
 *
 * ### CSS Registry Lifecycle Pattern
 *
 * For tests using CSS validation, follow this pattern:
 *
 * ```typescript
 * let ctx: TestContext;
 *
 * beforeAll(() => {
 *   ctx = createTestContext(); // Initialize services once
 * });
 *
 * // Option 1: Setup CSS once (for tests that don't modify CSS registry)
 * beforeAll(() => {
 *   setupCSSRegistry(ctx, 'file:///styles.css', CSS_FIXTURES.common);
 * });
 *
 * // Option 2: Setup CSS per-test (for tests that modify CSS registry)
 * beforeEach(() => {
 *   setupCSSRegistry(ctx, 'file:///styles.css', CSS_FIXTURES.common);
 * });
 * ```
 *
 * **When to use each approach:**
 * - **beforeAll()** for CSS setup: Tests only READ from CSS registry (most tests)
 * - **beforeEach()** for CSS setup: Tests MODIFY CSS registry (hot-reload tests)
 *
 * @see {@link file://./../../specs/022-test-suite-refactoring/quickstart.md} for usage guide
 * @see {@link file://./../../specs/022-test-suite-refactoring/TEST_SUITE_ANALYSIS.md} for detailed analysis
 */

import type { LangiumDocument } from 'langium';
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import type { Diagnostic } from 'vscode-languageserver-types';
import { createEligianServices } from '../eligian-module.js';
import type { Program } from '../generated/ast.js';

/**
 * TestContext: Container for test infrastructure
 *
 * Contains all necessary services and helpers for testing Eligian language features.
 * Create once per test suite in beforeAll() for performance.
 *
 * @example
 * ```typescript
 * let ctx: TestContext;
 *
 * beforeAll(() => {
 *   ctx = createTestContext();
 * });
 *
 * test('example', async () => {
 *   const { errors } = await ctx.parseAndValidate(`
 *     timeline "Test" in ".container" using raf {}
 *   `);
 *   expect(errors).toHaveLength(0);
 * });
 * ```
 */
export interface TestContext {
  /** Eligian language services instance */
  services: ReturnType<typeof import('../eligian-module.js').createEligianServices>;
  /** Langium parse helper for parsing DSL code */
  parse: ReturnType<typeof import('langium/test').parseHelper<Program>>;
  /** Combined parse + validate helper (convenience method) */
  parseAndValidate: (code: string, cssFileUri?: string) => Promise<ValidationResult>;
}

/**
 * ValidationResult: Structured validation output
 *
 * Returned by parseAndValidate() helper with parsed document, program AST,
 * and diagnostics filtered by severity.
 */
export interface ValidationResult {
  /** Langium document containing parse result and diagnostics */
  document: LangiumDocument<Program>;
  /** Parsed program AST (convenience accessor for document.parseResult.value) */
  program: Program;
  /** All diagnostics (errors, warnings, information, hints) */
  diagnostics: Diagnostic[];
  /** Error-level diagnostics only (severity === DiagnosticSeverity.Error) */
  errors: Diagnostic[];
  /** Warning-level diagnostics only (severity === DiagnosticSeverity.Warning) */
  warnings: Diagnostic[];
}

/**
 * CSSFixture: CSS test data definition
 *
 * Defines CSS classes and IDs for test fixtures. Used with setupCSSRegistry()
 * to populate the CSS registry with test data.
 *
 * @example
 * ```typescript
 * const customFixture: CSSFixture = {
 *   classes: ['button', 'primary', 'secondary'],
 *   ids: ['app', 'container'],
 * };
 * setupCSSRegistry(ctx, 'file:///styles.css', customFixture);
 * ```
 */
export interface CSSFixture {
  /** CSS class names (without leading dot) */
  classes?: string[];
  /** CSS ID names (without leading hash) */
  ids?: string[];
}

/**
 * DiagnosticSeverity: Langium LSP protocol severity levels
 *
 * Enum for diagnostic severity levels matching the Language Server Protocol.
 * Use instead of magic numbers (1, 2, 3, 4) for better code clarity.
 *
 * @example
 * ```typescript
 * const errors = document.diagnostics?.filter(
 *   d => d.severity === DiagnosticSeverity.Error
 * ) ?? [];
 * ```
 */
export enum DiagnosticSeverity {
  /** Error severity (compilation/validation failures) */
  Error = 1,
  /** Warning severity (potential issues, best practice violations) */
  Warning = 2,
  /** Information severity (informational messages) */
  Information = 3,
  /** Hint severity (suggestions for improvement) */
  Hint = 4,
}

// ============================================================================
// CSS Test Fixtures
// ============================================================================

/**
 * CSS_FIXTURES: Predefined CSS test data
 *
 * Pre-defined CSS class and ID fixtures for common test scenarios.
 * Use these to eliminate CSS registry boilerplate in tests.
 *
 * @example
 * ```typescript
 * // Use common fixture
 * setupCSSRegistry(ctx, 'file:///styles.css', CSS_FIXTURES.common);
 *
 * // Use timeline fixture
 * setupCSSRegistry(ctx, 'file:///styles.css', CSS_FIXTURES.timeline);
 *
 * // Merge fixtures for tests needing both
 * const merged: CSSFixture = {
 *   classes: [...(CSS_FIXTURES.common.classes ?? []), ...(CSS_FIXTURES.timeline.classes ?? [])],
 *   ids: [...(CSS_FIXTURES.common.ids ?? []), ...(CSS_FIXTURES.timeline.ids ?? [])],
 * };
 * setupCSSRegistry(ctx, 'file:///styles.css', merged);
 * ```
 */
export const CSS_FIXTURES = {
  /** Common CSS classes and IDs used across most tests */
  common: {
    classes: ['button', 'primary', 'secondary', 'active', 'hidden', 'visible'],
    ids: ['app', 'container', 'box', 'element'],
  } as CSSFixture,

  /** Timeline-specific CSS classes and IDs */
  timeline: {
    classes: ['test-container', 'container', 'presentation-container'],
    ids: ['test', 'title', 'credits'],
  } as CSSFixture,
} as const;

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create test context with services, parse helper, and parseAndValidate helper
 *
 * This factory creates a complete test environment with:
 * - Eligian language services (with EmptyFileSystem)
 * - Langium parse helper for parsing DSL code
 * - parseAndValidate() helper that combines parsing and validation
 *
 * Call once per test suite in beforeAll() for performance. Each test gets
 * an independent services instance (no shared mutable state).
 *
 * @returns TestContext with services, parse, and parseAndValidate
 *
 * @example
 * ```typescript
 * import { createTestContext, type TestContext } from './test-helpers.js';
 *
 * describe('My Tests', () => {
 *   let ctx: TestContext;
 *
 *   beforeAll(() => {
 *     ctx = createTestContext();
 *   });
 *
 *   test('parses valid timeline', async () => {
 *     const { errors, program } = await ctx.parseAndValidate(`
 *       timeline "Test" in ".container" using raf {}
 *     `);
 *     expect(errors).toHaveLength(0);
 *     expect(program.timelines).toHaveLength(1);
 *   });
 * });
 * ```
 */
export function createTestContext(): TestContext {
  // Create services with EmptyFileSystem (no actual file I/O)
  const services = createEligianServices(EmptyFileSystem);

  // Create parse helper
  const parse = parseHelper<Program>(services.Eligian);

  // Create parseAndValidate helper
  const parseAndValidate = async (
    code: string,
    cssFileUri = 'file:///styles.css'
  ): Promise<ValidationResult> => {
    // Parse code
    const document = await parse(code);

    // Register CSS imports if provided
    const cssRegistry = services.Eligian.css.CSSRegistry;
    const documentUri = document.uri?.toString();
    if (documentUri && cssFileUri) {
      cssRegistry.registerImports(documentUri, [cssFileUri]);
    }

    // Build document with validation
    await services.shared.workspace.DocumentBuilder.build([document], {
      validation: true,
    });

    // Extract program AST
    const program = document.parseResult.value as Program;

    // Extract diagnostics
    const diagnostics = document.diagnostics ?? [];
    const errors = getErrors(document);
    const warnings = getWarnings(document);

    return {
      document,
      program,
      diagnostics,
      errors,
      warnings,
    };
  };

  return {
    services,
    parse,
    parseAndValidate,
  };
}

/**
 * Filter diagnostics to errors only (severity === DiagnosticSeverity.Error)
 *
 * @param document Langium document with diagnostics
 * @returns Array of error-level diagnostics (empty array if none)
 *
 * @example
 * ```typescript
 * const document = await ctx.parse(`timeline "Test" ...`);
 * const errors = getErrors(document);
 * expect(errors).toHaveLength(0);
 * ```
 */
export function getErrors(document: LangiumDocument): Diagnostic[] {
  return document.diagnostics?.filter(d => d.severity === DiagnosticSeverity.Error) ?? [];
}

/**
 * Filter diagnostics to warnings only (severity === DiagnosticSeverity.Warning)
 *
 * @param document Langium document with diagnostics
 * @returns Array of warning-level diagnostics (empty array if none)
 *
 * @example
 * ```typescript
 * const document = await ctx.parse(`timeline "Test" ...`);
 * const warnings = getWarnings(document);
 * expect(warnings).toHaveLength(0);
 * ```
 */
export function getWarnings(document: LangiumDocument): Diagnostic[] {
  return document.diagnostics?.filter(d => d.severity === DiagnosticSeverity.Warning) ?? [];
}

/**
 * Setup CSS registry with test fixture data
 *
 * Populates the CSS registry with predefined CSS classes and IDs for testing.
 * This eliminates the need to manually call updateCSSFile() with boilerplate
 * metadata in every CSS-related test.
 *
 * @param ctx Test context from createTestContext()
 * @param cssFileUri CSS file URI (default: 'file:///styles.css')
 * @param fixture CSS fixture with classes and IDs (default: CSS_FIXTURES.common)
 *
 * @example
 * ```typescript
 * import { createTestContext, setupCSSRegistry, CSS_FIXTURES } from './test-helpers.js';
 *
 * describe('CSS Tests', () => {
 *   let ctx: TestContext;
 *
 *   beforeAll(() => {
 *     ctx = createTestContext();
 *     setupCSSRegistry(ctx, 'file:///styles.css', CSS_FIXTURES.common);
 *   });
 *
 *   test('validates CSS class', async () => {
 *     const { errors } = await ctx.parseAndValidate(`
 *       action test [ addClass("button") ]
 *     `);
 *     expect(errors).toHaveLength(0);
 *   });
 * });
 * ```
 */
export function setupCSSRegistry(
  ctx: TestContext,
  cssFileUri = 'file:///styles.css',
  fixture: CSSFixture = CSS_FIXTURES.common
): void {
  // Get CSS registry from services
  const cssRegistry = ctx.services.Eligian.css.CSSRegistry;

  // Update CSS file with fixture data
  cssRegistry.updateCSSFile(cssFileUri, {
    classes: new Set(fixture.classes ?? []),
    ids: new Set(fixture.ids ?? []),
    classLocations: new Map(),
    idLocations: new Map(),
    classRules: new Map(),
    idRules: new Map(),
    errors: [],
  });
}

/**
 * Create a library document in the test workspace
 *
 * Parses library code and adds the document to the workspace's LangiumDocuments
 * collection. This allows validators to resolve library imports using
 * LangiumDocuments.getDocument().
 *
 * @param ctx Test context from createTestContext()
 * @param libraryCode Library source code to parse
 * @param libraryUri URI for the library file (e.g., 'file:///test/animations.eligian')
 * @returns Langium document for the library
 *
 * @example
 * ```typescript
 * beforeAll(async () => {
 *   ctx = createTestContext();
 *
 *   // Create library document with actions
 *   await createLibraryDocument(ctx, `
 *     library animations
 *
 *     action fadeIn(selector: string, duration: number) [
 *       selectElement(selector)
 *       animate({opacity: 1}, duration)
 *     ]
 *   `, 'file:///test/animations.eligian');
 * });
 *
 * test('imports from library', async () => {
 *   const { errors } = await ctx.parseAndValidate(`
 *     import { fadeIn } from "./animations.eligian"
 *   `);
 *   expect(errors).toHaveLength(0);
 * });
 * ```
 */
export async function createLibraryDocument(
  ctx: TestContext,
  libraryCode: string,
  libraryUri: string
): Promise<LangiumDocument> {
  // Parse library code using the parse helper (which handles URI conversion AND adds to workspace)
  const libraryDoc = await ctx.parse(libraryCode, { documentUri: libraryUri });

  // Build document (triggers validation)
  await ctx.services.shared.workspace.DocumentBuilder.build([libraryDoc], {
    validation: true,
  });

  // Document is already added to workspace by parseHelper, so just return it
  return libraryDoc;
}
