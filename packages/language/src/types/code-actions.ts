/**
 * Type definitions for code action handlers
 * Feature: Label File Creation Quick Fix (039)
 */

/**
 * Command arguments for creating a missing labels file
 */
export interface CreateLabelsFileCommand {
  /** Absolute file system path where the labels file should be created */
  filePath: string;
  /** JSON content to write to the file (either [] or template with example entry) */
  content: string;
  /** URI of the Eligian document that triggered the quick fix (for context) */
  documentUri: string;
  /** List of language codes extracted from languages block (for logging/telemetry) */
  languageCodes?: string[];
}

/**
 * Structure of a labels file template entry
 */
export interface LabelsFileTemplate {
  /** Label identifier */
  id: string;
  /** Placeholder text for each language code (dynamic properties) */
  [languageCode: string]: string;
}

/**
 * Diagnostic data for a missing labels file
 */
export interface MissingLabelsFileData {
  /** Original import path from the labels import statement */
  importPath: string;
  /** Absolute file system path (resolved from import path) */
  resolvedPath: string;
  /** Whether the Eligian file has a languages block */
  hasLanguagesBlock: boolean;
  /** Language codes if languages block exists */
  languageCodes?: string[];
}

/**
 * Error codes for file creation operations
 */
export enum FileErrorCode {
  InvalidPath = 'INVALID_PATH',
  PermissionDenied = 'PERMISSION_DENIED',
  FileSystemError = 'FILE_SYSTEM_ERROR',
  EditorNotFound = 'EDITOR_NOT_FOUND',
}

/**
 * Error details for file creation failures
 */
export interface FileCreationError {
  /** Error code */
  code: FileErrorCode;
  /** Human-readable error message */
  message: string;
  /** Original error object (for logging) */
  cause?: Error;
}

/**
 * Result of labels file creation operation
 */
export interface FileCreationResult {
  /** Whether file creation succeeded */
  success: boolean;
  /** Absolute path to the created (or attempted) file */
  filePath: string;
  /** Error details if creation failed */
  error?: FileCreationError;
  /** Whether label editor opened successfully */
  editorOpened: boolean;
}
