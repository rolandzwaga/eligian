/**
 * Asset Loading Types
 *
 * Type definitions for asset validation and error reporting.
 */

export interface AssetError {
  type: 'missing-file' | 'invalid-html' | 'invalid-css' | 'load-error';
  filePath: string; // Relative path from source
  absolutePath: string; // Resolved absolute path
  sourceLocation: SourceLocation;
  message: string;
  hint: string;
  details?: string;
}

export interface HtmlValidationError {
  message: string;
  line: number;
  column: number;
  hint: string;
}

export interface CssValidationError {
  message: string;
  line: number;
  column: number;
  hint: string;
}

export interface SourceLocation {
  file: string;
  line: number;
  column: number;
}

export interface HtmlValidationResult {
  valid: boolean;
  errors: HtmlValidationError[];
}

export interface CssValidationResult {
  valid: boolean;
  errors: CssValidationError[];
}

export interface MediaValidationError {
  message: string;
  absolutePath: string;
  hint: string;
}

export interface MediaValidationResult {
  valid: boolean;
  errors: MediaValidationError[];
}
