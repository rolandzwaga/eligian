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
 * @see {@link file://./../../specs/022-test-suite-refactoring/quickstart.md} for usage guide
 */

import { EmptyFileSystem } from 'langium';
import type { LangiumDocument } from 'langium';
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
    cssFileUri = 'file:///styles.css',
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
  return (
    document.diagnostics?.filter((d) => d.severity === DiagnosticSeverity.Error) ?? []
  );
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
  return (
    document.diagnostics?.filter((d) => d.severity === DiagnosticSeverity.Warning) ?? []
  );
}
