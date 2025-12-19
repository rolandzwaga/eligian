/**
 * I/O error types for Eligian DSL
 *
 * This module re-exports I/O error types from @eligian/shared-utils for convenience.
 * These errors cover file system operations (file not found, permission denied, read errors, etc.).
 *
 * All errors use discriminated unions with a `_tag` field for type-safe runtime discrimination.
 *
 * @module errors/io-errors
 */

// Re-export all I/O error types from shared-utils
export type { FileOperationError as IOError } from '@eligian/shared-utils';
// Re-export type guards for I/O errors
