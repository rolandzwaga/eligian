/**
 * API Contract: HTML Import Validation
 *
 * Validation functions for HTML import declarations in Eligian DSL.
 * Follows compiler-first validation pattern (Principle X).
 *
 * Location: packages/language/src/eligian-validator.ts
 */

import type { ValidationAcceptor } from 'langium';

// ============================================================================
// AST Node Types (from Langium)
// ============================================================================

/**
 * HTMLImport AST node (from eligian.langium)
 */
export interface HTMLImport {
  readonly name: string;                  // Variable name
  readonly path: string;                  // File path
  readonly $cstNode?: {
    readonly range: {
      readonly start: { readonly line: number; readonly column: number };
      readonly end: { readonly line: number; readonly column: number };
    };
  };
}

/**
 * Program AST node (from eligian.langium)
 */
export interface Program {
  readonly htmlImports: ReadonlyArray<HTMLImport>;
  // ... other properties
}

// ============================================================================
// Validation Error Types
// ============================================================================

/**
 * Validation error codes for HTML imports
 */
export type HTMLImportErrorCode =
  | 'DUPLICATE_HTML_VARIABLE'      // Variable name already defined
  | 'HTML_FILE_NOT_FOUND'          // File doesn't exist at path
  | 'HTML_PERMISSION_DENIED'       // File exists but not readable
  | 'HTML_PATH_SECURITY_VIOLATION' // Path escapes project directory
  | 'INVALID_HTML_PATH'            // Path is malformed
  | 'EMPTY_HTML_FILE'              // File is empty (warning)
  | 'HTML_FILE_TOO_LARGE';         // File exceeds 1MB (warning)

/**
 * Validation error details
 */
export interface HTMLImportValidationError {
  readonly code: HTMLImportErrorCode;
  readonly message: string;
  readonly hint?: string;
  readonly severity: 'error' | 'warning';
  readonly location: {
    readonly line: number;
    readonly column: number;
  };
}

// ============================================================================
// Validator Functions (Langium Integration)
// ============================================================================

/**
 * Check for duplicate HTML import variable names
 *
 * @param program - Program AST node
 * @param accept - Langium validation acceptor
 *
 * @remarks
 * - Tracks all HTML import names
 * - Reports error for duplicates with location of first definition
 * - Error severity: 'error'
 *
 * @example
 * ```eligian
 * import header from './header.html'
 * import header from './other.html'  // ERROR: Duplicate
 * ```
 */
export function checkHTMLImportDuplicates(
  program: Program,
  accept: ValidationAcceptor
): void;

/**
 * Check that HTML import path resolves to existing file
 *
 * @param htmlImport - HTMLImport AST node
 * @param sourceFilePath - Absolute path to source .eligian file
 * @param projectRoot - Absolute path to project root
 * @param accept - Langium validation acceptor
 *
 * @remarks
 * - Resolves path using PathResolverService
 * - Checks file existence using fs.promises.access
 * - Reports FileNotFound or PermissionDenied errors
 * - Error severity: 'error'
 *
 * @example
 * ```eligian
 * import missing from './missing.html'  // ERROR: File not found
 * ```
 */
export function checkHTMLImportPathExists(
  htmlImport: HTMLImport,
  sourceFilePath: string,
  projectRoot: string,
  accept: ValidationAcceptor
): void;

/**
 * Check that HTML import path is within project directory (security)
 *
 * @param htmlImport - HTMLImport AST node
 * @param sourceFilePath - Absolute path to source .eligian file
 * @param projectRoot - Absolute path to project root
 * @param accept - Langium validation acceptor
 *
 * @remarks
 * - Uses PathResolverService.validateWithinProject
 * - Rejects paths that escape project directory
 * - Error severity: 'error'
 * - Per FR-013 (security requirement)
 *
 * @example
 * ```eligian
 * import bad from '../../../etc/passwd'  // ERROR: Path security violation
 * ```
 */
export function checkHTMLImportPathSecurity(
  htmlImport: HTMLImport,
  sourceFilePath: string,
  projectRoot: string,
  accept: ValidationAcceptor
): void;

/**
 * Check HTML file size (performance warning)
 *
 * @param htmlImport - HTMLImport AST node
 * @param resolvedPath - Absolute path to HTML file (after resolution)
 * @param accept - Langium validation acceptor
 *
 * @remarks
 * - Checks file size using fs.promises.stat
 * - Warns if file exceeds 1MB
 * - Error severity: 'warning' (not blocking)
 *
 * @example
 * ```eligian
 * import large from './very-large.html'  // WARNING: File exceeds 1MB
 * ```
 */
export function checkHTMLFileSize(
  htmlImport: HTMLImport,
  resolvedPath: string,
  accept: ValidationAcceptor
): void;

/**
 * Check HTML file is not empty (optional warning)
 *
 * @param htmlImport - HTMLImport AST node
 * @param resolvedPath - Absolute path to HTML file (after resolution)
 * @param accept - Langium validation acceptor
 *
 * @remarks
 * - Checks file size using fs.promises.stat
 * - Warns if file is empty (0 bytes)
 * - Error severity: 'warning' (not blocking)
 * - Empty files are technically valid, but often unintentional
 *
 * @example
 * ```eligian
 * import empty from './empty.html'  // WARNING: HTML file is empty
 * ```
 */
export function checkHTMLFileNotEmpty(
  htmlImport: HTMLImport,
  resolvedPath: string,
  accept: ValidationAcceptor
): void;

// ============================================================================
// Validation Orchestration
// ============================================================================

/**
 * Run all HTML import validations for a program
 *
 * @param program - Program AST node
 * @param sourceFilePath - Absolute path to source .eligian file
 * @param projectRoot - Absolute path to project root
 * @param accept - Langium validation acceptor
 *
 * @remarks
 * Orchestrates all validation checks:
 * 1. Check for duplicate variable names
 * 2. For each import:
 *    a. Validate path security
 *    b. Check file exists
 *    c. Check file size (warning)
 *    d. Check file not empty (warning)
 *
 * @example
 * ```typescript
 * // In eligian-validator.ts
 * @Check
 * checkHTMLImports(program: Program, accept: ValidationAcceptor): void {
 *   const sourceFilePath = this.getSourceFilePath(program);
 *   const projectRoot = this.getProjectRoot();
 *   validateHTMLImports(program, sourceFilePath, projectRoot, accept);
 * }
 * ```
 */
export function validateHTMLImports(
  program: Program,
  sourceFilePath: string,
  projectRoot: string,
  accept: ValidationAcceptor
): void;

// ============================================================================
// Error Message Formatting
// ============================================================================

/**
 * Format duplicate variable error message
 */
export function formatDuplicateVariableError(
  variableName: string,
  firstLine: number
): string;

/**
 * Format file not found error message
 */
export function formatFileNotFoundError(
  path: string
): string;

/**
 * Format permission denied error message
 */
export function formatPermissionDeniedError(
  path: string
): string;

/**
 * Format path security violation error message
 */
export function formatPathSecurityError(
  importPath: string,
  resolvedPath: string,
  projectRoot: string
): string;

/**
 * Format file size warning message
 */
export function formatFileSizeWarning(
  path: string,
  sizeBytes: number
): string;

/**
 * Format empty file warning message
 */
export function formatEmptyFileWarning(
  path: string
): string;

// ============================================================================
// Usage Examples
// ============================================================================

/**
 * Example validator implementation in eligian-validator.ts
 */
export const VALIDATOR_EXAMPLE = `
// packages/language/src/eligian-validator.ts
import { ValidationAcceptor, ValidationChecks } from 'langium';
import { Program, HTMLImport } from './generated/ast.js';
import { EligianAstType } from './generated/ast.js';

export class EligianValidator {
  // ... other validators

  /**
   * Validate HTML imports
   */
  @Check
  checkHTMLImports(program: Program, accept: ValidationAcceptor): void {
    const sourceFilePath = this.getSourceFilePath(program);
    const projectRoot = this.getProjectRoot();

    // Run all HTML import validations
    validateHTMLImports(program, sourceFilePath, projectRoot, accept);
  }

  /**
   * Get source file path from program AST
   */
  private getSourceFilePath(program: Program): string {
    return program.$document?.uri?.fsPath ?? '';
  }

  /**
   * Get project root from workspace or CLI
   */
  private getProjectRoot(): string {
    // VS Code: workspace root
    // CLI: current working directory
    return process.cwd();
  }
}
`;

// ============================================================================
// Test Cases (for reference)
// ============================================================================

/**
 * Test cases that MUST be covered in validation.spec.ts
 */
export const HTML_IMPORT_VALIDATION_TEST_CASES = [
  // Duplicate detection
  {
    name: 'Detect duplicate import variable names',
    code: `
      import header from './header.html'
      import header from './other.html'
    `,
    expectedError: 'DUPLICATE_HTML_VARIABLE',
    expectedMessage: "Variable '@header' is already defined"
  },

  // File existence
  {
    name: 'Detect missing HTML file',
    code: `
      import missing from './missing.html'
    `,
    expectedError: 'HTML_FILE_NOT_FOUND',
    expectedMessage: "HTML file not found: './missing.html'"
  },

  // Path security
  {
    name: 'Detect path escape attempt',
    code: `
      import bad from '../../../etc/passwd'
    `,
    expectedError: 'HTML_PATH_SECURITY_VIOLATION',
    expectedMessage: 'HTML imports must be within project directory'
  },

  // Valid cases
  {
    name: 'Accept valid single import',
    code: `
      import header from './header.html'
    `,
    expectedError: null
  },
  {
    name: 'Accept valid multiple imports',
    code: `
      import header from './header.html'
      import footer from './footer.html'
    `,
    expectedError: null
  },
  {
    name: 'Accept parent directory import (within project)',
    code: `
      import shared from '../shared/component.html'
    `,
    expectedError: null
  }
] as const;
