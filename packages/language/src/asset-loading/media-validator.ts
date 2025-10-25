/**
 * Media File Validator Implementation
 *
 * Validates media files by checking existence only.
 * Content/format validation is out of scope.
 */

import { existsSync, statSync } from 'node:fs';
import type { IMediaValidator } from './interfaces.js';
import type { MediaValidationError, MediaValidationResult } from './types.js';

/**
 * Media file validator implementation
 *
 * Validates media files (images, audio, video) by checking:
 * - File existence
 * - Is a file (not directory)
 *
 * Note: Content/format validation is intentionally not performed.
 * The validator only ensures the file exists and is accessible.
 */
export class MediaValidator implements IMediaValidator {
  /**
   * Validate media file (check existence only)
   *
   * @param absolutePath - Absolute path to media file
   * @returns Validation result with errors if file doesn't exist
   */
  validate(absolutePath: string): MediaValidationResult {
    const errors: MediaValidationError[] = [];

    // Check for empty path
    if (!absolutePath || absolutePath.trim().length === 0) {
      return {
        valid: false,
        errors: [
          {
            message: 'Media file path is empty',
            absolutePath: absolutePath || '',
            hint: 'Provide a valid file path to a media file',
          },
        ],
      };
    }

    try {
      // Check if file exists
      if (!existsSync(absolutePath)) {
        errors.push({
          message: `Media file not found: ${absolutePath}`,
          absolutePath,
          hint: 'Check that the file path is correct and the file exists',
        });
        return {
          valid: false,
          errors,
        };
      }

      // Check if it's a file (not directory)
      const stats = statSync(absolutePath);
      if (!stats.isFile()) {
        errors.push({
          message: `Path is not a file: ${absolutePath}`,
          absolutePath,
          hint: 'Media files must be files, not directories',
        });
        return {
          valid: false,
          errors,
        };
      }

      // File exists and is a file - valid
      return {
        valid: true,
        errors: [],
      };
    } catch (error) {
      // Handle any file system errors
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      errors.push({
        message: `Failed to access media file: ${errorMessage}`,
        absolutePath,
        hint: 'Check file permissions and that the path is valid',
      });

      return {
        valid: false,
        errors,
      };
    }
  }
}
