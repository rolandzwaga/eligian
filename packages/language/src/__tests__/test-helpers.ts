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
import { createMockFileSystem, type MockFileSystemProvider } from './mock-file-system.js';

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
  /** Mock file system instance (only present if created with createTestContextWithMockFS) */
  mockFs?: MockFileSystemProvider;
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
 * Create test context with mock file system for cross-document testing
 *
 * This factory creates a test environment with an in-memory file system that
 * enables cross-document reference resolution (e.g., library imports).
 * Use this when tests need to:
 * - Import actions from library files
 * - Validate file existence checks
 * - Test cross-document references
 *
 * The mock file system stores files in memory as a Map<string, string>.
 * Files must be added explicitly using `ctx.mockFs.writeFile()`.
 *
 * @returns TestContext with services, parse, parseAndValidate, and mockFs
 *
 * @example
 * ```typescript
 * import { createTestContextWithMockFS, type TestContext } from './test-helpers.js';
 *
 * describe('Import Tests', () => {
 *   let ctx: TestContext;
 *
 *   beforeAll(() => {
 *     ctx = createTestContextWithMockFS();
 *
 *     // Add library file to mock FS
 *     ctx.mockFs!.writeFile('file:///test/animations.eligian', `
 *       library animations
 *       action fadeIn(selector: string) [
 *         selectElement(selector)
 *       ]
 *     `);
 *   });
 *
 *   test('imports action from library', async () => {
 *     const { errors } = await ctx.parseAndValidate(`
 *       import { fadeIn } from "./animations.eligian"
 *     `, { documentUri: 'file:///test/main.eligian' });
 *     expect(errors).toHaveLength(0);
 *   });
 * });
 * ```
 */
export function createTestContextWithMockFS(): TestContext {
  // Create mock file system
  const { fileSystemProvider, fs } = createMockFileSystem();

  // Create services with mock file system
  const services = createEligianServices({ fileSystemProvider });

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
    if (cssRegistry && cssFileUri) {
      const documentUri = document.uri.toString();
      cssRegistry.registerImports(documentUri, [cssFileUri]);
    }

    // Build and validate
    await services.shared.workspace.DocumentBuilder.build([document], {
      validation: true,
    });

    // Extract diagnostics
    const diagnostics = document.diagnostics ?? [];
    const errors = diagnostics.filter(d => d.severity === DiagnosticSeverity.Error);
    const warnings = diagnostics.filter(d => d.severity === DiagnosticSeverity.Warning);

    return {
      document,
      program: document.parseResult.value,
      diagnostics,
      errors,
      warnings,
    };
  };

  return {
    services,
    parse,
    parseAndValidate,
    mockFs: fs,
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
 * If the test context has a mock file system (created with createTestContextWithMockFS),
 * the library code is also written to the mock FS to enable file existence checks.
 *
 * @param ctx Test context from createTestContext() or createTestContextWithMockFS()
 * @param libraryCode Library source code to parse
 * @param libraryUri URI for the library file (e.g., 'file:///test/animations.eligian')
 * @returns Langium document for the library
 *
 * @example
 * ```typescript
 * beforeAll(async () => {
 *   ctx = createTestContextWithMockFS(); // Use mock FS for cross-document refs
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
 *   `, { documentUri: 'file:///test/main.eligian' });
 *   expect(errors).toHaveLength(0);
 * });
 * ```
 */
export async function createLibraryDocument(
  ctx: TestContext,
  libraryCode: string,
  libraryUri: string
): Promise<LangiumDocument> {
  // If mock FS is available, write the library file to it
  // This enables validators that check file existence (checkImportFileExists)
  if (ctx.mockFs) {
    ctx.mockFs.writeFile(libraryUri, libraryCode);
  }

  // Parse library code using the parse helper (which handles URI conversion AND adds to workspace)
  const libraryDoc = await ctx.parse(libraryCode, { documentUri: libraryUri });

  // Build document (triggers validation)
  await ctx.services.shared.workspace.DocumentBuilder.build([libraryDoc], {
    validation: true,
  });

  // Document is already added to workspace by parseHelper, so just return it
  return libraryDoc;
}

/**
 * Setup multiple documents in the test workspace with automatic building
 *
 * Documents are parsed and added to the workspace, then built together to
 * resolve cross-references (e.g., imports). All documents are validated.
 *
 * @param ctx Test context with Langium services
 * @param documents Array of {uri, content} pairs
 * @returns Map of URI → LangiumDocument for easy lookup
 *
 * @example
 * ```typescript
 * const docs = await setupDocuments(ctx, [
 *   { uri: 'file:///test/lib.eligian', content: 'library lib ...' },
 *   { uri: 'file:///test/main.eligian', content: 'import { x } from "./lib.eligian"' },
 * ]);
 * const mainDoc = docs.get('file:///test/main.eligian')!;
 * ```
 */
export async function setupDocuments(
  ctx: TestContext,
  documents: Array<{ uri: string; content: string }>
): Promise<Map<string, LangiumDocument>> {
  const docs = new Map<string, LangiumDocument>();

  // Parse all documents first
  for (const { uri, content } of documents) {
    if (ctx.mockFs) {
      ctx.mockFs.writeFile(uri, content);
    }
    const doc = await ctx.parse(content, { documentUri: uri });
    docs.set(uri, doc);
  }

  // Build all documents together (resolves cross-references)
  await ctx.services.shared.workspace.DocumentBuilder.build(Array.from(docs.values()), {
    validation: true,
  });

  return docs;
}

/**
 * Create multiple library documents (convenience wrapper around setupDocuments)
 *
 * This is a semantic wrapper that makes the intent explicit when creating libraries
 * in test setup (especially in beforeAll hooks for shared libraries).
 *
 * @param ctx Test context with Langium services
 * @param libraries Array of {uri, content} pairs for library files
 * @returns Map of URI → LangiumDocument for easy lookup
 *
 * @example
 * ```typescript
 * beforeAll(async () => {
 *   ctx = createTestContextWithMockFS();
 *   await createLibraryDocuments(ctx, [
 *     { uri: 'file:///test/animations.eligian', content: 'library animations ...' },
 *     { uri: 'file:///test/utils.eligian', content: 'library utils ...' },
 *   ]);
 * });
 * ```
 */
export async function createLibraryDocuments(
  ctx: TestContext,
  libraries: Array<{ uri: string; content: string }>
): Promise<Map<string, LangiumDocument>> {
  return setupDocuments(ctx, libraries);
}

// ============================================================================
// PROGRAM TEMPLATE BUILDERS
// ============================================================================
// These helpers eliminate 600+ repetitions of minimum valid program boilerplate
// across 20+ test files. Use these instead of writing inline code blocks.

/**
 * Options for building a minimal valid Eligian program
 */
export interface ProgramOptions {
  /** Include CSS import statement (default: true) */
  cssImport?: boolean;
  /** CSS file path for import (default: "./styles.css") */
  cssPath?: string;
  /** Action name to define (default: "testAction") */
  actionName?: string;
  /** Action parameters with optional types (default: []) */
  actionParams?: Array<{ name: string; type?: string }>;
  /** Action body operations (default: [ selectElement("#element") ]) */
  actionBody?: string;
  /** Timeline name (default: "test") */
  timelineName?: string;
  /** Timeline container selector (default: ".container") */
  containerSelector?: string;
  /** Timeline provider type (default: "raf") */
  provider?: 'raf' | 'video' | 'audio' | 'custom';
  /** Source for video/audio providers (default: "test.mp4") */
  providerSource?: string;
  /** Timeline body - operations/events (default: calls action) */
  timelineBody?: string;
}

/**
 * Build a minimal valid Eligian program for testing
 *
 * This eliminates the most common duplication pattern in tests (880+ occurrences).
 * Every test needs a valid program with CSS import, action, and timeline.
 *
 * @param options Program configuration options
 * @returns Valid Eligian program string
 *
 * @example Basic usage
 * ```typescript
 * const code = minimalProgram();
 * // Generates:
 * // styles "./styles.css"
 * // action testAction() [ selectElement("#element") ]
 * // timeline "test" in ".container" using raf {
 * //   at 0s testAction()
 * // }
 * ```
 *
 * @example Custom action with parameters
 * ```typescript
 * const code = minimalProgram({
 *   actionName: 'fadeIn',
 *   actionParams: [
 *     { name: 'selector', type: 'string' },
 *     { name: 'duration', type: 'number' }
 *   ],
 *   actionBody: `
 *     selectElement(selector)
 *     animate({opacity: 1}, duration)
 *   `
 * });
 * ```
 *
 * @example Video timeline
 * ```typescript
 * const code = minimalProgram({
 *   provider: 'video',
 *   providerSource: 'demo.mp4',
 *   timelineBody: 'at 0s..5s testAction()'
 * });
 * ```
 *
 * @example No CSS import
 * ```typescript
 * const code = minimalProgram({
 *   cssImport: false,
 *   actionBody: 'log("test")'
 * });
 * ```
 */
export function minimalProgram(options: ProgramOptions = {}): string {
  const opts = {
    cssImport: true,
    cssPath: './styles.css',
    actionName: 'testAction',
    actionParams: [],
    actionBody: 'selectElement("#element")',
    timelineName: 'test',
    containerSelector: '.container',
    provider: 'raf' as const,
    providerSource: 'test.mp4',
    timelineBody: '',
    ...options,
  };

  let code = '';

  // CSS import
  if (opts.cssImport) {
    code += `styles "${opts.cssPath}"\n\n`;
  }

  // Action definition
  const params =
    opts.actionParams.length > 0
      ? opts.actionParams.map(p => (p.type ? `${p.name}: ${p.type}` : p.name)).join(', ')
      : '';
  code += `action ${opts.actionName}(${params}) [\n`;
  code += `  ${opts.actionBody}\n`;
  code += ']\n\n';

  // Timeline declaration
  code += `timeline "${opts.timelineName}" in "${opts.containerSelector}" using ${opts.provider}`;
  if (opts.provider === 'video' || opts.provider === 'audio') {
    code += ` from "${opts.providerSource}"`;
  }
  code += ' {\n';

  // Timeline body
  const body = opts.timelineBody || `at 0s ${opts.actionName}()`;
  code += `  ${body}\n`;
  code += '}\n';

  return code;
}

/**
 * Build an event action program for event validation testing
 *
 * This pattern appears 10+ times across event validation tests.
 * Provides a minimal valid program with event action definition.
 *
 * @param eventName Event name to handle (e.g., "dom-mutation")
 * @param actionName Action name to define (e.g., "HandleMutation")
 * @param params Optional parameters with types
 * @param actionBody Optional custom action body
 * @returns Valid Eligian program string
 *
 * @example
 * ```typescript
 * const code = eventActionProgram('dom-mutation', 'HandleMutation');
 * // Generates:
 * // styles "./test.css"
 * // action init() [ selectElement("#app") ]
 * // on event "dom-mutation" action HandleMutation() [
 * //   selectElement("#app")
 * // ]
 * // timeline "test" in "#app" using raf {
 * //   at 0s..1s init()
 * // }
 * ```
 *
 * @example With parameters
 * ```typescript
 * const code = eventActionProgram(
 *   'data-sync',
 *   'HandleSync',
 *   [
 *     { name: 'status', type: 'string' },
 *     { name: 'count', type: 'number' }
 *   ]
 * );
 * ```
 */
export function eventActionProgram(
  eventName: string,
  actionName: string,
  params: Array<{ name: string; type?: string }> = [],
  actionBody = 'selectElement("#app")'
): string {
  const paramStr =
    params.length > 0 ? params.map(p => (p.type ? `${p.name}: ${p.type}` : p.name)).join(', ') : '';

  return `
styles "./test.css"

action init() [ selectElement("#app") ]

on event "${eventName}" action ${actionName}(${paramStr}) [
  ${actionBody}
]

timeline "test" in "#app" using raf {
  at 0s..1s init()
}
`;
}

/**
 * Build an endable action program for timeline testing
 *
 * Creates a program with an endable action (start/end blocks).
 * Useful for timeline event tests.
 *
 * @param actionName Endable action name
 * @param startBody Start block operations
 * @param endBody End block operations
 * @param timeRange Time range for timeline event (default: "0s..5s")
 * @returns Valid Eligian program string
 *
 * @example
 * ```typescript
 * const code = endableActionProgram(
 *   'showTitle',
 *   'selectElement("#title")\naddClass("visible")',
 *   'removeClass("visible")'
 * );
 * ```
 */
export function endableActionProgram(
  actionName: string,
  startBody: string,
  endBody: string,
  timeRange = '0s..5s'
): string {
  return `
styles "./styles.css"

endable action ${actionName} [
  ${startBody}
] [
  ${endBody}
]

timeline "test" in ".container" using raf {
  at ${timeRange} ${actionName}()
}
`;
}

/**
 * Re-export MockAssetLoader for testing with mock file system
 */
export { MockAssetLoader } from './mock-asset-loader.js';
