/**
 * API Contract: PathResolverService
 *
 * Service responsible for resolving HTML import paths and validating security constraints.
 * Ensures HTML imports cannot escape project directory.
 *
 * Location: packages/compiler/src/path-resolver.ts
 */

import { Effect, Context } from 'effect';

// ============================================================================
// Error Types
// ============================================================================

/**
 * Errors that can occur during path resolution
 */
export type PathResolutionError =
  | PathSecurityError
  | InvalidPathError;

/**
 * Path escapes project directory (security violation)
 */
export interface PathSecurityError {
  readonly _tag: 'PathSecurityViolation';
  readonly importPath: string;          // Original path from import statement
  readonly resolvedPath: string;        // Absolute path after resolution
  readonly projectRoot: string;         // Project root directory
  readonly sourceLocation: SourceLocation;
}

/**
 * Path is invalid or malformed
 */
export interface InvalidPathError {
  readonly _tag: 'InvalidPath';
  readonly importPath: string;
  readonly reason: string;
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
 * PathResolverService - Resolves and validates HTML import paths
 *
 * @example
 * ```typescript
 * const resolver = yield* _(PathResolverService);
 * const absolutePath = yield* _(
 *   resolver.resolveHTMLPath(
 *     './snippet.html',
 *     '/project/src/timeline.eligian',
 *     '/project',
 *     { line: 5, column: 8 }
 *   )
 * );
 * // absolutePath: '/project/src/snippet.html'
 * ```
 */
export class PathResolverService extends Context.Tag('PathResolver')<
  PathResolverService,
  {
    /**
     * Resolve HTML import path to absolute path and validate security
     *
     * @param importPath - Relative path from import statement (e.g., './snippet.html')
     * @param sourceFilePath - Absolute path to source .eligian file
     * @param projectRoot - Absolute path to project root directory
     * @param sourceLocation - Location in DSL where import was declared
     * @returns Effect that yields absolute path OR PathResolutionError
     *
     * @remarks
     * - Resolves relative paths using path.resolve()
     * - Validates path is within project directory
     * - Normalizes path separators (cross-platform)
     * - Rejects paths that escape project directory (security)
     *
     * @example
     * ```typescript
     * // Valid path
     * const path1 = yield* _(resolveHTMLPath(
     *   './header.html',
     *   '/project/src/main.eligian',
     *   '/project',
     *   { line: 3, column: 8 }
     * ));
     * // path1: '/project/src/header.html'
     *
     * // Valid path with directory traversal (stays within project)
     * const path2 = yield* _(resolveHTMLPath(
     *   '../shared/footer.html',
     *   '/project/src/pages/home.eligian',
     *   '/project',
     *   { line: 5, column: 8 }
     * ));
     * // path2: '/project/src/shared/footer.html'
     *
     * // Invalid path - escapes project directory
     * const path3 = yield* _(resolveHTMLPath(
     *   '../../../etc/passwd',
     *   '/project/src/main.eligian',
     *   '/project',
     *   { line: 7, column: 8 }
     * ));
     * // Error: PathSecurityViolation
     * ```
     */
    readonly resolveHTMLPath: (
      importPath: string,
      sourceFilePath: string,
      projectRoot: string,
      sourceLocation: SourceLocation
    ) => Effect.Effect<string, PathResolutionError>;

    /**
     * Normalize path separators for cross-platform compatibility
     *
     * @param path - Path with any separator style
     * @returns Path with forward slashes (Unix-style)
     *
     * @remarks
     * - Converts backslashes to forward slashes
     * - Used internally by resolveHTMLPath
     * - Can be called directly for testing/debugging
     *
     * @example
     * ```typescript
     * const normalized = normalizePath('src\\components\\header.html');
     * // normalized: 'src/components/header.html'
     * ```
     */
    readonly normalizePath: (path: string) => string;

    /**
     * Check if path is within project directory (security check)
     *
     * @param absolutePath - Absolute path after resolution
     * @param projectRoot - Project root directory
     * @returns Effect that yields void OR PathSecurityError
     *
     * @remarks
     * Uses path.relative() to check if path escapes project:
     * - If relative path starts with '..' → outside project
     * - If relative path is absolute → different drive (Windows)
     *
     * @example
     * ```typescript
     * // Valid path
     * yield* _(validateWithinProject('/project/src/file.html', '/project'));
     * // Success (no error)
     *
     * // Invalid path
     * yield* _(validateWithinProject('/etc/passwd', '/project'));
     * // Error: PathSecurityViolation
     * ```
     */
    readonly validateWithinProject: (
      absolutePath: string,
      projectRoot: string,
      sourceLocation: SourceLocation
    ) => Effect.Effect<void, PathSecurityError>;
  }
>() {}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create user-friendly error message for path security violation
 */
export const formatPathSecurityError = (error: PathSecurityError): string => {
  return [
    'HTML imports must be within project directory',
    `  Import path: '${error.importPath}'`,
    `  Resolves to: '${error.resolvedPath}'`,
    `  Project root: '${error.projectRoot}'`,
    `  (line ${error.sourceLocation.line}, column ${error.sourceLocation.column})`
  ].join('\n');
};

/**
 * Create user-friendly error message for invalid path
 */
export const formatInvalidPathError = (error: InvalidPathError): string => {
  return `Invalid HTML import path: '${error.importPath}' (${error.reason})`;
};

// ============================================================================
// Usage Examples
// ============================================================================

/**
 * Example 1: Resolve HTML import with error handling
 */
export const resolveHTMLImport = (
  importPath: string,
  sourceFile: string,
  projectRoot: string,
  location: SourceLocation
) =>
  Effect.gen(function* (_) {
    const resolver = yield* _(PathResolverService);

    const absolutePath = yield* _(
      resolver.resolveHTMLPath(importPath, sourceFile, projectRoot, location),
      Effect.catchAll(error => {
        if (error._tag === 'PathSecurityViolation') {
          return Effect.fail(formatPathSecurityError(error));
        }
        return Effect.fail(formatInvalidPathError(error));
      })
    );

    return absolutePath;
  });

/**
 * Example 2: Batch resolve multiple imports
 */
export const resolveMultipleImports = (
  imports: Array<{
    path: string;
    location: SourceLocation;
  }>,
  sourceFile: string,
  projectRoot: string
) =>
  Effect.gen(function* (_) {
    const resolver = yield* _(PathResolverService);

    const resolved = yield* _(
      Effect.all(
        imports.map(({ path, location }) =>
          resolver.resolveHTMLPath(path, sourceFile, projectRoot, location)
        ),
        { concurrency: 'unbounded' }
      )
    );

    return resolved;
  });

/**
 * Example 3: Validate path without full resolution
 */
export const validatePathOnly = (absolutePath: string, projectRoot: string, location: SourceLocation) =>
  Effect.gen(function* (_) {
    const resolver = yield* _(PathResolverService);
    yield* _(resolver.validateWithinProject(absolutePath, projectRoot, location));
  });

// ============================================================================
// Testing Utilities
// ============================================================================

/**
 * Mock PathResolverService for testing
 *
 * @example
 * ```typescript
 * const mockResolver = createMockPathResolver('/project');
 *
 * const path = await Effect.runPromise(
 *   resolveHTMLPath('./file.html', '/project/src/main.eligian', '/project', { line: 1, column: 1 }).pipe(
 *     Effect.provide(mockResolver)
 *   )
 * );
 * // path: '/project/src/file.html'
 * ```
 */
export const createMockPathResolver = (projectRoot: string) => {
  const resolveHTMLPath = (
    importPath: string,
    sourceFilePath: string,
    _projectRoot: string,
    location: SourceLocation
  ): Effect.Effect<string, PathResolutionError> => {
    // Simple mock: resolve relative to source directory
    const sourceDir = sourceFilePath.substring(0, sourceFilePath.lastIndexOf('/'));
    const resolved = `${sourceDir}/${importPath.replace('./', '')}`;

    // Check if within project
    if (!resolved.startsWith(projectRoot)) {
      return Effect.fail({
        _tag: 'PathSecurityViolation' as const,
        importPath,
        resolvedPath: resolved,
        projectRoot,
        sourceLocation: location
      });
    }

    return Effect.succeed(resolved);
  };

  const normalizePath = (path: string): string => {
    return path.replace(/\\/g, '/');
  };

  const validateWithinProject = (
    absolutePath: string,
    _projectRoot: string,
    location: SourceLocation
  ): Effect.Effect<void, PathSecurityError> => {
    if (!absolutePath.startsWith(projectRoot)) {
      return Effect.fail({
        _tag: 'PathSecurityViolation' as const,
        importPath: absolutePath,
        resolvedPath: absolutePath,
        projectRoot,
        sourceLocation: location
      });
    }
    return Effect.succeed(undefined);
  };

  return { resolveHTMLPath, normalizePath, validateWithinProject };
};

// ============================================================================
// Test Cases (for reference)
// ============================================================================

/**
 * Test cases that MUST be covered in path-resolver.spec.ts
 */
export const PATH_RESOLVER_TEST_CASES = [
  // Valid paths
  { name: 'Simple relative path', importPath: './file.html', expected: 'valid' },
  { name: 'Subdirectory path', importPath: './sub/file.html', expected: 'valid' },
  { name: 'Parent directory (within project)', importPath: '../shared/file.html', expected: 'valid' },
  { name: 'Multiple parent directories (within project)', importPath: '../../common/file.html', expected: 'valid' },

  // Invalid paths - security violations
  { name: 'Escape project root', importPath: '../../../etc/passwd', expected: 'PathSecurityViolation' },
  { name: 'Escape with relative path', importPath: '../../../../outside.html', expected: 'PathSecurityViolation' },

  // Edge cases
  { name: 'Normalized path separators', importPath: '.\\windows\\style.html', expected: 'valid' },
  { name: 'Path with spaces', importPath: './files/my file.html', expected: 'valid' },
  { name: 'Path with special characters', importPath: './files/file-name_v2.html', expected: 'valid' }
] as const;
