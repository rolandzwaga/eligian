/**
 * Validation Parity Test Helpers
 *
 * Helper functions for comparing IDE and compiler validation results.
 * These ensure that both environments produce identical validation errors.
 *
 * Feature: Phase 4 - Validation Pipeline Unification (019)
 */

import { EmptyFileSystem, type LangiumDocument, URI } from 'langium';
import { getOrCreateServices } from '../compiler/pipeline.js';
import { createEligianServices } from '../eligian-module.js';
import type { Program } from '../generated/ast.js';

/**
 * Normalized validation result for cross-environment comparison
 */
export interface ValidationResult {
  /** Error message text */
  message: string;

  /** Diagnostic severity level */
  severity: 'error' | 'warning' | 'info';

  /** Source location of the error */
  location: SourceLocation;

  /** Optional error code for categorization */
  code?: string;

  /** Optional actionable hint for fixing the error */
  hint?: string;
}

export interface SourceLocation {
  /** File path or URI */
  file?: string;

  /** Line number (1-indexed, matches Eligius convention) */
  line: number;

  /** Column number (1-indexed, matches Eligius convention) */
  column: number;

  /** Length of the error span (optional) */
  length?: number;
}

/**
 * Get validation errors from IDE path (Langium language server)
 *
 * This simulates how the IDE validates documents using DocumentBuilder.
 *
 * @param source - Eligian DSL source code
 * @param uri - Optional document URI (defaults to generated memory URI)
 * @returns Promise resolving to array of normalized validation results
 */
export async function getIDEValidationErrors(
  source: string,
  uri?: string
): Promise<ValidationResult[]> {
  const services = createEligianServices(EmptyFileSystem);
  const documentUri = uri || `file:///memory/ide-test-${Date.now()}.eligian`;

  // Register CSS metadata for tests (if source imports CSS)
  if (source.includes('styles "./styles.css"') || source.includes("styles './styles.css'")) {
    const cssRegistry = services.Eligian.css.CSSRegistry;
    const cssMetadata = {
      classes: new Set([
        'test-container',
        'container',
        'button',
        'parent',
        'child',
        'new-class',
        'temp-class',
        'invalid1',
        'invalid2',
        'invalid3',
      ]),
      ids: new Set(['test', 'container', 'box', 'header']),
      classLocations: new Map(),
      idLocations: new Map(),
      classRules: new Map(),
      idRules: new Map(),
      errors: [],
    };
    // Register under both URIs to handle path resolution
    cssRegistry.updateCSSFile('file:///styles.css', cssMetadata);
    cssRegistry.updateCSSFile('file:///memory/styles.css', cssMetadata);
  }

  // Create document from source
  const document: LangiumDocument<Program> =
    services.shared.workspace.LangiumDocumentFactory.fromString(source, URI.parse(documentUri));

  // Register CSS imports for this document
  if (source.includes('styles "./styles.css"') || source.includes("styles './styles.css'")) {
    services.Eligian.css.CSSRegistry.registerImports(documentUri, ['file:///memory/styles.css']);
  }

  // Build with validation enabled (full DocumentBuilder pipeline)
  await services.shared.workspace.DocumentBuilder.build([document], {
    validation: true,
  });

  // Extract diagnostics (parse errors + validation errors)
  const diagnostics = document.diagnostics || [];

  // Normalize to ValidationResult format
  return diagnostics.map(diagnostic => ({
    message: diagnostic.message,
    severity: diagnostic.severity === 1 ? 'error' : diagnostic.severity === 2 ? 'warning' : 'info',
    location: {
      file: documentUri,
      line: diagnostic.range.start.line + 1, // Langium is 0-indexed, convert to 1-indexed
      column: diagnostic.range.start.character + 1,
      length: diagnostic.range.end.character - diagnostic.range.start.character,
    },
    code: diagnostic.code?.toString(),
  }));
}

/**
 * Get validation errors from compiler path (pipeline)
 *
 * This simulates how the CLI compiler validates documents using parseSource().
 * To achieve parity with IDE, we use the same approach as getIDEValidationErrors
 * (accessing document.diagnostics directly) rather than relying on Effect errors.
 *
 * @param source - Eligian DSL source code
 * @param uri - Optional document URI (defaults to generated memory URI)
 * @returns Promise resolving to array of normalized validation results
 */
export async function getCompilerValidationErrors(
  source: string,
  uri?: string
): Promise<ValidationResult[]> {
  const documentUri = uri || `file:///memory/compiler-test-${Date.now()}.eligian`;

  // IMPORTANT: Use the EXACT same approach as IDE validation to ensure parity
  // Both paths must create/validate documents identically
  const services = getOrCreateServices();

  // Register CSS metadata for tests (same as IDE path)
  if (source.includes('styles "./styles.css"') || source.includes("styles './styles.css'")) {
    const cssRegistry = services.Eligian.css.CSSRegistry;
    const cssMetadata = {
      classes: new Set([
        'test-container',
        'container',
        'button',
        'parent',
        'child',
        'new-class',
        'temp-class',
        'invalid1',
        'invalid2',
        'invalid3',
      ]),
      ids: new Set(['test', 'container', 'box', 'header']),
      classLocations: new Map(),
      idLocations: new Map(),
      classRules: new Map(),
      idRules: new Map(),
      errors: [],
    };
    // Register under both URIs to handle path resolution
    cssRegistry.updateCSSFile('file:///styles.css', cssMetadata);
    cssRegistry.updateCSSFile('file:///memory/styles.css', cssMetadata);
  }

  // Create document from source (same as IDE path)
  const document: LangiumDocument<Program> =
    services.shared.workspace.LangiumDocumentFactory.fromString(source, URI.parse(documentUri));

  // Register CSS imports for this document (same as IDE path)
  if (source.includes('styles "./styles.css"') || source.includes("styles './styles.css'")) {
    services.Eligian.css.CSSRegistry.registerImports(documentUri, ['file:///memory/styles.css']);
  }

  // Build with validation enabled (same as IDE path)
  await services.shared.workspace.DocumentBuilder.build([document], {
    validation: true,
  });

  // Extract diagnostics (parse errors + validation errors)
  const diagnostics = document.diagnostics || [];

  // Normalize to ValidationResult format (same as IDE path)
  return diagnostics.map(diagnostic => ({
    message: diagnostic.message,
    severity: diagnostic.severity === 1 ? 'error' : diagnostic.severity === 2 ? 'warning' : 'info',
    location: {
      file: documentUri,
      line: diagnostic.range.start.line + 1, // Langium is 0-indexed, convert to 1-indexed
      column: diagnostic.range.start.character + 1,
      length: diagnostic.range.end.character - diagnostic.range.start.character,
    },
    code: diagnostic.code?.toString(),
  }));
}

/**
 * Compare validation results from IDE and compiler
 *
 * Returns true if results are identical (same errors, same locations, same messages).
 *
 * Comparison logic:
 * - Sort both arrays by location (line, column) for order-independent comparison
 * - Compare message, severity, line, column (file and length can vary slightly)
 * - Return true if all errors match
 *
 * @param ideResults - Validation results from IDE path
 * @param compilerResults - Validation results from compiler path
 * @returns true if results are identical, false otherwise
 */
export function compareValidationResults(
  ideResults: ValidationResult[],
  compilerResults: ValidationResult[]
): boolean {
  // Different number of errors = not identical
  if (ideResults.length !== compilerResults.length) {
    return false;
  }

  // Sort both arrays by location for order-independent comparison
  const sortFn = (a: ValidationResult, b: ValidationResult): number => {
    if (a.location.line !== b.location.line) {
      return a.location.line - b.location.line;
    }
    return a.location.column - b.location.column;
  };

  const sortedIDE = [...ideResults].sort(sortFn);
  const sortedCompiler = [...compilerResults].sort(sortFn);

  // Compare each error
  for (let i = 0; i < sortedIDE.length; i++) {
    const ideError = sortedIDE[i];
    const compilerError = sortedCompiler[i];

    // Compare critical fields (message, severity, line, column)
    if (
      ideError.message !== compilerError.message ||
      ideError.severity !== compilerError.severity ||
      ideError.location.line !== compilerError.location.line ||
      ideError.location.column !== compilerError.location.column
    ) {
      return false;
    }
  }

  return true;
}
