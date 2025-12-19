/**
 * Type definitions for code action handlers
 * Feature: Label File Creation Quick Fix (039)
 * Feature: Missing Label Entry Quick Fix (041)
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
interface FileCreationError {
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

// =============================================================================
// Feature 041: Missing Label Entry Quick Fix
// =============================================================================

/**
 * Diagnostic data for a missing label ID reference
 * Extends the standard diagnostic data with information needed for the quick fix
 */
export interface MissingLabelIDData {
  /** Diagnostic code identifying this as a missing label ID error */
  code: 'unknown_label_id';
  /** The label ID that doesn't exist in the labels file */
  labelId: string;
  /** URI of the labels file to modify */
  labelsFileUri: string;
  /** Language codes from the languages block (or ['en-US'] if no block defined) */
  languageCodes: string[];
}

/**
 * Command arguments for creating a missing label entry
 */
export interface CreateLabelEntryCommand {
  /** The label ID to create */
  labelId: string;
  /** Absolute file system path of the labels file to modify */
  labelsFilePath: string;
  /** Language codes to create translations for */
  languageCodes: string[];
  /** URI of the Eligian document that triggered the quick fix (for context) */
  documentUri: string;
}

/**
 * Error codes for label entry creation operations
 */
export enum LabelEntryErrorCode {
  /** Labels file could not be read */
  FileReadError = 'FILE_READ_ERROR',
  /** Labels file could not be written */
  FileWriteError = 'FILE_WRITE_ERROR',
  /** Labels file contains invalid JSON */
  InvalidJson = 'INVALID_JSON',
  /** Label ID already exists in the labels file */
  LabelExists = 'LABEL_EXISTS',
}

/**
 * Error details for label entry creation failures
 */
interface LabelEntryError {
  /** Error code */
  code: LabelEntryErrorCode;
  /** Human-readable error message */
  message: string;
  /** Original error object (for logging) */
  cause?: Error;
}

/**
 * Result of label entry creation operation
 */
export interface LabelEntryCreationResult {
  /** Whether label entry creation succeeded */
  success: boolean;
  /** The label ID that was created (or attempted) */
  labelId: string;
  /** Absolute path to the labels file */
  labelsFilePath: string;
  /** Error details if creation failed */
  error?: LabelEntryError;
}
