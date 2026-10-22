/**
 * Pipeline: Source parsing
 *
 * Parses DSL source into a Langium AST, loading imported libraries and CSS
 * files into the shared services before validation so the compiler and IDE
 * produce identical results. Also exposes the (no-op) AST semantic-validation
 * stage that exists for pipeline completeness.
 */

import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { Effect } from 'effect';
import { type LangiumDocument, URI } from 'langium';
import { createEmptyCSSMetadata, parseCSS } from '../../css/css-parser.js';
import type { ParseError, ValidationError } from '../../errors/index.js';
import { isLibrary, type Program } from '../../generated/ast.js';
import { isDefaultImport } from '../../utils/ast-helpers.js';
import { resolveImportRelativePath } from '../../utils/path-utils.js';
import { extractDocumentErrors } from './document-errors.js';
import {
  extractLibraryImports,
  loadLibraryRecursive,
  resolveLibraryPath,
} from './library-loader.js';
import { getOrCreateServices } from './services.js';

/**
 * Document counter for generating unique URIs
 *
 * Each parse call needs a unique URI to avoid conflicts in Langium's
 * document manager. We use a counter to ensure uniqueness.
 */
let documentCounter = 0;

/**
 * T076: Parse DSL source → Langium AST
 *
 * Uses Langium parser to convert source string to AST.
 * Returns ParseError if syntax is invalid.
 *
 * Note: Reuses a shared Langium service instance for better performance
 * and to prevent memory exhaustion during testing. Each parse gets a unique
 * URI to avoid document conflicts. Documents are removed from the workspace
 * after parsing to prevent memory leaks.
 */
export const parseSource = (
  source: string,
  uri?: string
): Effect.Effect<Program, ParseError | ValidationError> =>
  Effect.gen(function* () {
    // Generate unique URI if not provided
    const uriString = uri ?? `file:///memory/source-${documentCounter++}.eligian`;
    const documentUri = URI.parse(uriString);

    // T017: Load library files BEFORE parsing/validation if URI is provided
    // This ensures libraries are in the workspace when scope provider runs
    let mainDocument: LangiumDocument<Program> | undefined;
    const libraryDocuments: LangiumDocument[] = [];
    if (uri) {
      // Pre-parse to extract library imports, then load all documents
      const services = getOrCreateServices();

      // Create main document
      mainDocument = yield* Effect.sync(() =>
        services.shared.workspace.LangiumDocumentFactory.fromString<Program>(source, documentUri)
      );

      // Quick parse to extract imports (no linking/validation yet)
      yield* Effect.promise(() =>
        services.shared.workspace.DocumentBuilder.build([mainDocument!], {
          validation: false,
        })
      );

      const tempProgram = mainDocument.parseResult.value;

      // Check if user tried to compile a library file directly
      if (isLibrary(tempProgram as any)) {
        return yield* Effect.fail({
          _tag: 'ParseError' as const,
          message: 'Cannot compile library files directly',
          location: { line: 1, column: 1, length: 0 },
          hint: 'Library files must be imported by a main program. Create a .eligian file with an "import" statement to use this library.',
        });
      }

      const importPaths = extractLibraryImports(tempProgram);

      // Feature 032 US3: Load each library recursively (including nested dependencies)
      for (const importPath of importPaths) {
        const libraryUri = resolveLibraryPath(documentUri, importPath);

        // Recursively load library and all its dependencies with cycle detection
        const nestedLibraries = yield* loadLibraryRecursive(libraryUri, documentUri);

        // Add all nested libraries to the collection (avoiding duplicates)
        for (const libDoc of nestedLibraries) {
          if (!libraryDocuments.some(doc => doc.uri.toString() === libDoc.uri.toString())) {
            libraryDocuments.push(libDoc);
          }
        }
      }

      // CRITICAL: Reset main document to Parsed state before final build
      // Why: We already built it once to extract imports (reached state 5)
      // Now we need to re-link it with libraries available, so reset to Parsed
      // This forces it to go through IndexedContent → Linked again
      services.shared.workspace.DocumentBuilder.resetToState(mainDocument, 1); // DocumentState.Parsed

      // CRITICAL: Build ALL documents together in ONE call
      // This ensures proper linking order:
      // 1. All docs reach IndexedContent (exports visible)
      // 2. Then all docs reach Linked (imports resolved)
      // Without this, main doc tries to link before libraries are indexed
      yield* Effect.promise(() =>
        services.shared.workspace.DocumentBuilder.build([mainDocument!, ...libraryDocuments], {
          validation: false,
        })
      );
    }

    // Wrap Langium parsing in Effect.tryPromise
    const result = yield* Effect.tryPromise({
      try: async () => {
        // Reuse shared Langium services (singleton pattern)
        const services = getOrCreateServices();

        // EXPLICIT STATE RESET: Clear CSS registry for this document before parsing
        // Why: Singleton service retains state between compilations (state pollution)
        // Effect: Ensures each compilation is independent and deterministic
        if (uri) {
          services.Eligian.css.CSSRegistry.clearDocument(uriString);
        }

        // Reuse main document if libraries were loaded, otherwise create new one
        const document =
          mainDocument ||
          services.shared.workspace.LangiumDocumentFactory.fromString<Program>(source, documentUri);

        // Build document (will be a no-op if already built from library loading)
        await services.shared.workspace.DocumentBuilder.build([document], {
          validation: false,
        });

        // CRITICAL: CSS files MUST be loaded BEFORE validateDocument() call
        // Why: Validators (e.g., CSS class validation) require CSS registry to be populated
        // Order: parse → load CSS → validate (no race condition, synchronous execution)
        // This synchronous ordering ensures IDE and compiler validation produce identical results
        // Accept both file:// URIs and absolute file paths

        const cssRegistry = services.Eligian.css.CSSRegistry;

        // For test documents (no URI provided), CSS imports are automatically registered
        // by ensureCSSImportsRegistered in the validator, which resolves "./styles.css"
        // to "file:///memory/styles.css" based on the document's directory.
        // No manual registration needed here.

        if (uri) {
          const root = document.parseResult.value;

          // Extract CSS imports from AST
          const cssFiles: string[] = [];
          for (const statement of root.statements) {
            if (isDefaultImport(statement) && statement.type === 'styles') {
              if (!statement.path) {
                continue;
              }
              const cssPath = statement.path.replace(/^["']|["']$/g, '');
              cssFiles.push(cssPath);
            }
          }

          // Parse each CSS file and load into registry
          const docPath = documentUri.fsPath;
          const docDir = path.dirname(docPath);
          const cssFileUris: string[] = [];
          for (const cssRelativePath of cssFiles) {
            // Convert relative path to absolute (D4: shared resolution,
            // path.join handles ./, ., ../). Computed once for both branches.
            const cssFilePath = resolveImportRelativePath(cssRelativePath, docDir);
            // Convert to absolute URI (must match validator format)
            const cssFileUri = URI.file(cssFilePath).toString();
            cssFileUris.push(cssFileUri);

            try {
              // Read and parse CSS file
              const cssContent = readFileSync(cssFilePath, 'utf-8');
              const parseResult = parseCSS(cssContent, cssFilePath);

              // Update registry with parsed CSS
              cssRegistry.updateCSSFile(cssFileUri, parseResult);
            } catch (error) {
              // Register error in registry
              cssRegistry.updateCSSFile(
                cssFileUri,
                createEmptyCSSMetadata([
                  {
                    message: error instanceof Error ? error.message : 'Unknown error',
                    filePath: cssFileUri,
                    line: 0,
                    column: 0,
                  },
                ])
              );
            }
          }

          // CRITICAL FIX: Register document→CSS mapping (enables validation!)
          // Without this, cssRegistry.getClassesForDocument() returns empty set
          cssRegistry.registerImports(uriString, cssFileUris);
          // DEBUG: Check CSS registry state
        }

        // Now run validation with CSS loaded
        document.diagnostics =
          await services.Eligian.validation.DocumentValidator.validateDocument(document);

        return document;
      },
      catch: error => ({
        _tag: 'ParseError' as const,
        message: error instanceof Error ? error.message : String(error),
        location: { line: 1, column: 1, length: 0 },
        hint: 'Unexpected error during parsing',
      }),
    });

    const document = result;

    // Check for lexer / parser / semantic-validation errors
    yield* extractDocumentErrors(document, {
      lexerMessagePrefix: 'Lexer error: ',
      lexerHint: 'Check for invalid characters or tokens',
      parserHint: 'Check syntax against Eligian grammar',
      diagnosticHint: 'Semantic validation failed',
    });

    // Return parsed AST
    return document.parseResult.value;
  });

/**
 * T077: Validate AST semantics
 *
 * Note: Semantic validation is already performed by Langium during parsing
 * via eligian-validator.ts. This function is a no-op that exists for
 * pipeline completeness and potential future custom validations.
 */
export const validateAST = (program: Program): Effect.Effect<Program, never> =>
  Effect.succeed(program);
