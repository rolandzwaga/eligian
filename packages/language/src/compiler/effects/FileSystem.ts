/**
 * FileSystem Effect Service
 *
 * Provides file I/O operations as Effects for the compiler pipeline.
 * This abstraction allows easy mocking in tests and clean separation
 * of side effects.
 *
 * @module effects/FileSystem
 */

import { Context, type Effect } from 'effect';

/**
 * Error type for file I/O operations
 */
export class IOError {
  readonly _tag = 'IOError';
  constructor(
    readonly message: string,
    readonly path?: string,
    readonly cause?: unknown
  ) {}
}

/**
 * FileSystem service interface
 *
 * Provides typed file operations that return Effects.
 */
export class FileSystemService extends Context.Tag('FileSystem')<
  FileSystemService,
  {
    /**
     * Read file contents as UTF-8 string
     */
    readonly readFile: (path: string) => Effect.Effect<string, IOError>;

    /**
     * Write string contents to file (UTF-8)
     */
    readonly writeFile: (path: string, content: string) => Effect.Effect<void, IOError>;

    /**
     * Check if file exists
     */
    readonly fileExists: (path: string) => Effect.Effect<boolean, IOError>;

    /**
     * Read directory contents
     */
    readonly readDir: (path: string) => Effect.Effect<string[], IOError>;
  }
>() {}
