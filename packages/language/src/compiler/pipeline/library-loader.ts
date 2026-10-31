/**
 * Pipeline: Library import resolution and recursive loading
 *
 * Extracts library imports from program/library AST nodes, resolves their
 * relative paths to absolute URIs, reads and parses library files, and loads
 * libraries recursively with circular-dependency detection (Feature 032 US3).
 */

import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { Effect } from 'effect';
import { type LangiumDocument, URI } from 'langium';
import type { ParseError, ValidationError } from '../../errors/index.js';
import { isLibrary, isLibraryImport, type Library, type Program } from '../../generated/ast.js';
import { extractDocumentErrors } from './document-errors.js';
import { getOrCreateServices } from './services.js';

/**
 * T012: Extract library imports from AST
 *
 * Extracts all LibraryImport statements from the program AST and returns
 * an array of unique library file paths.
 *
 * Deduplicates imports - if multiple statements import from the same file,
 * only returns the path once.
 */
export function extractLibraryImports(program: Program): string[] {
  const importPaths = new Set<string>();

  for (const statement of program.statements) {
    if (isLibraryImport(statement)) {
      importPaths.add(statement.path);
    }
  }

  return Array.from(importPaths);
}

/**
 * Feature 032 US3: Extract library imports from Library AST node
 *
 * Similar to extractLibraryImports but for Library nodes.
 * Libraries can now import other libraries (nested dependencies).
 *
 * Returns array of unique library file paths.
 */
export function extractLibraryImportsFromLibrary(library: Library): string[] {
  const importPaths = new Set<string>();

  for (const importStmt of library.imports || []) {
    if (isLibraryImport(importStmt)) {
      importPaths.add(importStmt.path);
    }
  }

  return Array.from(importPaths);
}

/**
 * T013: Resolve library path to absolute URI
 *
 * Converts a relative library import path to an absolute `file://` URI based
 * on the current document's location.
 *
 * Handles:
 * - Relative paths with ./ and ../ (`.` and `..` segments are collapsed, so a
 *   file always resolves to the same canonical URI regardless of the route
 *   taken to reach it; cycle detection in loadLibraryRecursive relies on this)
 * - Platform-specific path separators (Windows \ vs Unix /)
 * - Windows drive letters (kept, and `..` never climbs above the drive root)
 * - Normalization to file:// URIs
 */
export function resolveLibraryPath(currentDocUri: URI, importPath: string): URI {
  // Work on the URI path (always forward slashes, drive encoded as `/c:`)
  // rather than the platform fsPath, so the result never depends on the
  // process's current working directory or drive.
  const docPath = currentDocUri.path.startsWith('/')
    ? currentDocUri.path
    : `/${currentDocUri.path}`;
  const currentDir = path.posix.dirname(docPath);

  // Keep a Windows drive prefix (`/c:`) as the resolution root.
  const drive = /^\/[a-zA-Z]:(?=\/|$)/.exec(currentDir)?.[0] ?? '';
  const dirWithinDrive = currentDir.slice(drive.length) || '/';

  // Import paths are written with forward slashes; tolerate backslashes.
  const normalizedImportPath = importPath.replace(/\\/g, '/');

  // posix.resolve collapses `.`/`..` segments. dirWithinDrive is absolute,
  // so process.cwd() is never consulted.
  const resolvedPath = drive + path.posix.resolve(dirWithinDrive, normalizedImportPath);

  return URI.from({
    scheme: 'file',
    authority: currentDocUri.scheme === 'file' ? currentDocUri.authority : '',
    path: resolvedPath,
  });
}

/**
 * Canonical key for a library file, used for circular-dependency detection.
 *
 * Normalizes `.`/`..` segments and separators and, on Windows (case-insensitive
 * filesystem), lowercases the path so different spellings of the same file
 * compare equal.
 */
export function libraryPathKey(libraryUri: URI): string {
  const normalized = path.normalize(libraryUri.fsPath);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

/**
 * T014: Load library file content
 *
 * Reads a library file from the file system and returns its content as a string.
 *
 * Returns Effect with typed errors:
 * - FileNotFoundError: File does not exist
 * - PermissionError: File cannot be read due to permissions
 * - ReadError: Other I/O errors
 */
export function loadLibraryFile(libraryUri: URI): Effect.Effect<string, ParseError> {
  return Effect.try({
    try: () => {
      const content = readFileSync(libraryUri.fsPath, 'utf-8');
      return content;
    },
    catch: error => {
      return {
        _tag: 'ParseError' as const,
        message: `Failed to load library file: ${(error as Error).message}`,
        location: { line: 1, column: 1, length: 0 },
        hint: `Check that the file exists at: ${libraryUri.fsPath}`,
      };
    },
  });
}

/**
 * T015: Parse library document
 *
 * Parses library file content into a Langium document and validates it's a Library node.
 *
 * Returns Effect with typed errors:
 * - ParseError: Syntax errors in library file
 * - InvalidLibraryError: File is not a library (e.g., it's a Program)
 */
export function parseLibraryDocument(
  content: string,
  libraryUri: URI
): Effect.Effect<Library, ParseError | ValidationError> {
  return Effect.gen(function* () {
    // Reuse the shared Langium services
    const services = getOrCreateServices();

    // Check if document already exists in workspace
    const existingDoc = services.shared.workspace.LangiumDocuments.getDocument(libraryUri);
    if (existingDoc) {
      // Remove cached document to force re-parse (handles library file edits)
      // This ensures we always get the latest file content
      services.shared.workspace.LangiumDocuments.deleteDocument(libraryUri);
    }

    // Parse library content
    const document = services.shared.workspace.LangiumDocumentFactory.fromString<Library>(
      content,
      libraryUri
    );

    // Build document (parse only, NO validation yet)
    // Feature 032 US3: Validation happens later after all nested libraries are loaded
    yield* Effect.tryPromise({
      try: async () => {
        await services.shared.workspace.DocumentBuilder.build([document], {
          validation: false,
        });

        // CRITICAL: Add document to workspace so it's accessible for cross-references
        // This ensures the scope provider can find actions from this library
        services.shared.workspace.LangiumDocuments.addDocument(document);

        return document;
      },
      catch: error => ({
        _tag: 'ParseError' as const,
        message: `Failed to parse library document: ${error instanceof Error ? error.message : String(error)}`,
        location: { line: 1, column: 1, length: 0 },
        hint: 'Check library file syntax',
      }),
    });

    // Check for lexer / parser / semantic-validation errors. The library's file
    // goes on each location so it is not rendered against the main program.
    const libraryFile = libraryUri.scheme === 'file' ? libraryUri.fsPath : libraryUri.toString();
    yield* extractDocumentErrors(document, {
      file: libraryFile,
      lexerMessagePrefix: 'Lexer error in library: ',
      lexerHint: `In library file: ${libraryUri.fsPath}`,
      parserHint: `In library file: ${libraryUri.fsPath}`,
      diagnosticHint: `In library file: ${libraryUri.fsPath}`,
    });

    // Validate that parsed content is a Library, not a Program
    const root: any = document.parseResult.value;
    if (!isLibrary(root)) {
      return yield* Effect.fail({
        _tag: 'ParseError' as const,
        message: `File is not a library (found ${root.$type || 'unknown'} instead)`,
        location: { file: libraryFile, line: 1, column: 1, length: 0 },
        hint: `Library files must start with "library <name>". File: ${libraryUri.fsPath}`,
      });
    }

    return root;
  });
}

/**
 * Feature 032 US3: Recursively load library and all its dependencies
 *
 * Loads a library file and all libraries it imports, with circular dependency detection.
 *
 * Algorithm:
 * 1. Check if library is already being loaded (circular dependency)
 * 2. Load the library file content
 * 3. Parse the library document
 * 4. Extract library imports from the library
 * 5. Recursively load each imported library
 * 6. Return all loaded library documents
 *
 * @param libraryUri - URI of library file to load
 * @param documentUri - URI of document importing this library (for path resolution)
 * @param loadingStack - Libraries currently being loaded, keyed by
 *   {@link libraryPathKey} with the display path as value (for cycle detection)
 * @param loaded - Libraries already loaded in this compilation, keyed by
 *   {@link libraryPathKey}. A library reached twice (imported directly AND
 *   through another library, or by two libraries) is loaded once: re-parsing
 *   it would delete the document the first importer was linked against.
 * @returns Effect with array of all library documents (self + dependencies)
 */
export function loadLibraryRecursive(
  libraryUri: URI,
  _documentUri: URI,
  loadingStack: ReadonlyMap<string, string> = new Map(),
  loaded: Map<string, LangiumDocument[]> = new Map()
): Effect.Effect<LangiumDocument[], ParseError | ValidationError> {
  return Effect.gen(function* () {
    const uriPath = libraryUri.fsPath;
    const key = libraryPathKey(libraryUri);

    // T029: Circular dependency detection, on the canonical key so routes
    // through `..` or differently-cased spellings cannot evade it
    if (loadingStack.has(key)) {
      // Build cycle chain for error message
      const chain = Array.from(loadingStack.values());
      chain.push(uriPath);
      const cycleChain = chain.join(' → ');

      return yield* Effect.fail({
        _tag: 'ParseError' as const,
        message: `Circular dependency detected: ${cycleChain}`,
        location: { line: 1, column: 1, length: 0 },
        hint: 'Remove circular import to break the cycle',
      });
    }

    // Already loaded in this compilation (diamond import): reuse it
    const alreadyLoaded = loaded.get(key);
    if (alreadyLoaded) {
      return alreadyLoaded;
    }

    // Add current library to loading stack
    const newStack = new Map(loadingStack);
    newStack.set(key, uriPath);

    // Load library file content
    const content = yield* loadLibraryFile(libraryUri);

    // Parse library document
    const library = yield* parseLibraryDocument(content, libraryUri);

    // Get library document from workspace
    const services = getOrCreateServices();
    const libDoc = services.shared.workspace.LangiumDocuments.getDocument(libraryUri);
    if (!libDoc) {
      return yield* Effect.fail({
        _tag: 'ParseError' as const,
        message: `Failed to retrieve library document from workspace: ${uriPath}`,
        location: { line: 1, column: 1, length: 0 },
        hint: 'Internal error - library was parsed but not added to workspace',
      });
    }

    // Collect all library documents (self + dependencies)
    const allLibraries: LangiumDocument[] = [libDoc];

    // Extract imports from this library
    const importPaths = extractLibraryImportsFromLibrary(library);

    // Recursively load each imported library
    for (const importPath of importPaths) {
      const nestedLibraryUri = resolveLibraryPath(libraryUri, importPath);

      // Recursively load nested library and its dependencies
      const nestedLibraries = yield* loadLibraryRecursive(
        nestedLibraryUri,
        libraryUri,
        newStack,
        loaded
      );

      allLibraries.push(...nestedLibraries);
    }

    loaded.set(key, allLibraries);
    return allLibraries;
  });
}
