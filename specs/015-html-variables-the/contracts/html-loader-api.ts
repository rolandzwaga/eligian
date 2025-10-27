/**
 * API Contract: HTMLLoaderService
 *
 * Service responsible for loading HTML file content with typed error handling.
 * Uses Effect-ts for principled error handling and composition.
 *
 * Location: packages/compiler/src/html-loader.ts
 */

import { Effect, Context } from 'effect';

// ============================================================================
// Error Types
// ============================================================================

/**
 * Errors that can occur during HTML file loading
 */
export type HTMLLoadError =
  | FileNotFoundError
  | PermissionDeniedError
  | ReadError;

/**
 * HTML file not found at specified path
 */
export interface FileNotFoundError {
  readonly _tag: 'FileNotFound';
  readonly path: string;
  readonly sourceLocation: SourceLocation;
}

/**
 * HTML file exists but is not readable (permission denied)
 */
export interface PermissionDeniedError {
  readonly _tag: 'PermissionDenied';
  readonly path: string;
  readonly sourceLocation: SourceLocation;
}

/**
 * HTML file read failed for other reasons (corrupted, I/O error, etc.)
 */
export interface ReadError {
  readonly _tag: 'ReadError';
  readonly path: string;
  readonly cause: Error;
  readonly sourceLocation: SourceLocation;
}

/**
 * Source location in Eligian DSL file
 */
export interface SourceLocation {
  readonly line: number;
  readonly column: number;
}

// ============================================================================
// Service Definition
// ============================================================================

/**
 * HTMLLoaderService - Loads HTML file content with Effect-ts error handling
 *
 * @example
 * ```typescript
 * const loader = yield* _(HTMLLoaderService);
 * const content = yield* _(loader.loadHTML('/project/snippet.html', { line: 5, column: 8 }));
 * // content: "<div>Hello</div>"
 * ```
 */
export class HTMLLoaderService extends Context.Tag('HTMLLoader')<
  HTMLLoaderService,
  {
    /**
     * Load HTML file content as UTF-8 string
     *
     * @param absolutePath - Absolute path to HTML file (already resolved and validated)
     * @param sourceLocation - Location in DSL where import was declared (for error reporting)
     * @returns Effect that yields HTML content string OR HTMLLoadError
     *
     * @example
     * ```typescript
     * // Success case
     * const content = yield* _(loadHTML('/project/header.html', { line: 3, column: 8 }));
     * // content: "<header>...</header>"
     *
     * // Error case - file not found
     * const result = yield* _(
     *   loadHTML('/project/missing.html', { line: 5, column: 8 }),
     *   Effect.catchAll(error => {
     *     if (error._tag === 'FileNotFound') {
     *       console.error(`File not found: ${error.path} (line ${error.sourceLocation.line})`);
     *     }
     *     return Effect.fail(error);
     *   })
     * );
     * ```
     */
    readonly loadHTML: (
      absolutePath: string,
      sourceLocation: SourceLocation
    ) => Effect.Effect<string, HTMLLoadError>;

    /**
     * Validate HTML file size (performance constraint)
     *
     * @param absolutePath - Absolute path to HTML file
     * @param maxSize - Maximum file size in bytes (default: 1MB)
     * @returns Effect that yields void OR FileSizeError
     *
     * @remarks
     * This check is separate from loadHTML to allow warning vs. error handling.
     * Large files can be loaded, but should trigger a warning to the user.
     *
     * @example
     * ```typescript
     * const result = yield* _(
     *   validateFileSize('/project/large.html', 1024 * 1024),
     *   Effect.catchAll(error => {
     *     console.warn(`HTML file exceeds 1MB: ${error.path} (${error.sizeBytes} bytes)`);
     *     return Effect.succeed(undefined);  // Warning, not error
     *   })
     * );
     * ```
     */
    readonly validateFileSize: (
      absolutePath: string,
      maxSize?: number
    ) => Effect.Effect<void, FileSizeError>;
  }
>() {}

/**
 * HTML file exceeds size limit (warning, not error)
 */
export interface FileSizeError {
  readonly _tag: 'FileSizeExceeded';
  readonly path: string;
  readonly sizeBytes: number;
  readonly maxBytes: number;
  readonly sourceLocation: SourceLocation;
}

// ============================================================================
// Usage Examples
// ============================================================================

/**
 * Example 1: Load HTML with error handling
 */
export const loadHTMLWithErrorHandling = Effect.gen(function* (_) {
  const loader = yield* _(HTMLLoaderService);

  const content = yield* _(
    loader.loadHTML('/project/snippet.html', { line: 5, column: 8 }),
    Effect.catchAll(error => {
      switch (error._tag) {
        case 'FileNotFound':
          return Effect.fail(`HTML file not found: ${error.path}`);
        case 'PermissionDenied':
          return Effect.fail(`Cannot read HTML file (permission denied): ${error.path}`);
        case 'ReadError':
          return Effect.fail(`Failed to read HTML file: ${error.path} (${error.cause.message})`);
      }
    })
  );

  return content;
});

/**
 * Example 2: Load multiple HTML files in parallel
 */
export const loadMultipleHTML = (paths: Array<{ path: string; location: SourceLocation }>) =>
  Effect.gen(function* (_) {
    const loader = yield* _(HTMLLoaderService);

    // Load all files in parallel
    const results = yield* _(
      Effect.all(
        paths.map(({ path, location }) => loader.loadHTML(path, location)),
        { concurrency: 'unbounded' }
      )
    );

    return results;
  });

/**
 * Example 3: Load HTML with size validation (warning on large files)
 */
export const loadHTMLWithSizeCheck = (path: string, location: SourceLocation) =>
  Effect.gen(function* (_) {
    const loader = yield* _(HTMLLoaderService);

    // Check size first (warning, not error)
    yield* _(
      loader.validateFileSize(path, 1024 * 1024),
      Effect.catchAll(error => {
        console.warn(`Warning: HTML file is large (${error.sizeBytes} bytes): ${error.path}`);
        return Effect.succeed(undefined);  // Continue despite warning
      })
    );

    // Load content
    const content = yield* _(loader.loadHTML(path, location));
    return content;
  });

// ============================================================================
// Testing Utilities
// ============================================================================

/**
 * Mock HTMLLoaderService for testing
 *
 * @example
 * ```typescript
 * const mockLoader = createMockHTMLLoader({
 *   '/project/header.html': '<header>Test</header>',
 *   '/project/missing.html': { _tag: 'FileNotFound' }
 * });
 *
 * const result = await Effect.runPromise(
 *   loadHTML('/project/header.html', { line: 1, column: 1 }).pipe(
 *     Effect.provide(mockLoader)
 *   )
 * );
 * // result: '<header>Test</header>'
 * ```
 */
export const createMockHTMLLoader = (
  files: Record<string, string | HTMLLoadError>
) => {
  const loadHTML = (path: string, location: SourceLocation): Effect.Effect<string, HTMLLoadError> => {
    const result = files[path];
    if (result === undefined) {
      return Effect.fail({ _tag: 'FileNotFound' as const, path, sourceLocation: location });
    }
    if (typeof result === 'string') {
      return Effect.succeed(result);
    }
    return Effect.fail(result);
  };

  const validateFileSize = (_path: string, _maxSize?: number): Effect.Effect<void, FileSizeError> => {
    return Effect.succeed(undefined);  // Mock always passes size validation
  };

  return { loadHTML, validateFileSize };
};
