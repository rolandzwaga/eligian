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

import type { LangiumDocument } from 'langium';
import type { Diagnostic } from 'vscode-languageserver-types';
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
