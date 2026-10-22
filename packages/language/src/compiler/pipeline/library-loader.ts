/**
 * Pipeline: Library import resolution and recursive loading
 *
 * Extracts library imports from program/library AST nodes, resolves their
 * relative paths to absolute URIs, reads and parses library files, and loads
 * libraries recursively with circular-dependency detection (Feature 032 US3).
 */

import { readFileSync } from 'node:fs';
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
 * Converts a relative library import path to an absolute URI based on
 * the current document's location.
 *
 * Handles:
 * - Relative paths with ./ and ../
 * - Platform-specific path separators (Windows \ vs Unix /)
 * - Normalization to file:// URIs
 */
export function resolveLibraryPath(currentDocUri: URI, importPath: string): URI {
  // Get the directory of the current document
  const currentPath = currentDocUri.fsPath;
  const separator = currentPath.includes('\\') ? '\\' : '/';
  const lastSepIndex = Math.max(currentPath.lastIndexOf('\\'), currentPath.lastIndexOf('/'));
  const currentDir = currentPath.substring(0, lastSepIndex);

  // Normalize import path to use forward slashes
  const normalizedImportPath = importPath.replace(/\\/g, '/');

  // Remove ./ prefix if present
  const cleanPath = normalizedImportPath.startsWith('./')
    ? normalizedImportPath.substring(2)
    : normalizedImportPath;

  // Resolve relative path
  const absolutePath = `${currentDir}${separator}${cleanPath}`;

  // Convert to URI
  return URI.file(absolutePath);
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

    // Check for lexer / parser / semantic-validation errors
    yield* extractDocumentErrors(document, {
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
        location: { line: 1, column: 1, length: 0 },
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
 * @param loadingStack - Stack of currently loading library paths (for cycle detection)
 * @returns Effect with array of all library documents (self + dependencies)
 */
export function loadLibraryRecursive(
  libraryUri: URI,
  _documentUri: URI,
  loadingStack: Set<string> = new Set()
): Effect.Effect<LangiumDocument[], ParseError | ValidationError> {
  return Effect.gen(function* () {
    const uriPath = libraryUri.fsPath;

    // T029: Circular dependency detection
    if (loadingStack.has(uriPath)) {
      // Build cycle chain for error message
      const chain = Array.from(loadingStack);
      chain.push(uriPath);
      const cycleChain = chain.join(' → ');

      return yield* Effect.fail({
        _tag: 'ParseError' as const,
        message: `Circular dependency detected: ${cycleChain}`,
        location: { line: 1, column: 1, length: 0 },
        hint: 'Remove circular import to break the cycle',
      });
    }

    // Add current library to loading stack
    const newStack = new Set(loadingStack);
    newStack.add(uriPath);

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
      const nestedLibraries = yield* loadLibraryRecursive(nestedLibraryUri, libraryUri, newStack);

      allLibraries.push(...nestedLibraries);
    }

    return allLibraries;
  });
}
