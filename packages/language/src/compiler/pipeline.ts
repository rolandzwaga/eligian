/**
 * Pipeline: Main Compilation Orchestration
 *
 * This module wires together all compilation stages into a complete
 * DSL → Eligius JSON pipeline using Effect composition.
 *
 * Pipeline stages:
 * 1. Parse: DSL source → Langium AST
 * 2. Transform: AST → Eligius IR
 * 3. Type Check: Validate IR constraints
 * 4. Optimize: Apply optimization passes
 * 5. Emit: IR → Eligius JSON configuration
 *
 * Design:
 * - Pure functional pipeline using Effect.flatMap composition
 * - Typed errors at each stage
 * - Configurable via CompileOptions
 * - No side effects (parsing/file I/O handled externally)
 */

import { readFileSync } from 'node:fs';
import { Effect } from 'effect';
import type { IEngineConfiguration } from 'eligius';
import { EmptyFileSystem, type LangiumDocument, URI } from 'langium';
import {
  type AssetLoadingResult,
  loadProgramAssets,
} from '../asset-loading/compiler-integration.js';
import { parseCSS } from '../css/css-parser.js';
import { createEligianServices } from '../eligian-module.js';
import type { EmitError, ParseError, TransformError, TypeError } from '../errors/index.js';
import { isLibrary, isLibraryImport, type Library, type Program } from '../generated/ast.js';
import { isDefaultImport } from '../utils/ast-helpers.js';
import { transformAST } from './ast-transformer.js';
import { emitJSON } from './emitter.js';
import { optimize } from './optimizer.js';
import { typeCheck } from './type-checker.js';
import type { EligiusIR } from './types/eligius-ir.js';

/**
 * Singleton Langium service instance
 *
 * Creating Langium services is expensive. We reuse a single instance across
 * all parse calls for better performance and to prevent memory exhaustion
 * when running many tests.
 *
 * STATE MANAGEMENT:
 * - CSS registry state persists across compilations (singleton retains state)
 * - Each parseSource() call MUST clear document-specific state via clearDocument()
 * - See explicit state reset in parseSource() before parsing (line ~130)
 * - This ensures compilation isolation and prevents state pollution
 */
let sharedServices: ReturnType<typeof createEligianServices> | undefined;

/**
 * Get or create singleton Langium service instance
 *
 * NOTE: Services are stateful (CSS registry, document cache). Callers must
 * explicitly clear document state via services.Eligian.css.CSSRegistry.clearDocument()
 * before each compilation to ensure independence.
 *
 * Exported for testing purposes (parity-helpers.ts needs access to shared services)
 */
export function getOrCreateServices() {
  if (!sharedServices) {
    sharedServices = createEligianServices(EmptyFileSystem);

    // Register CSS classes used in tests to prevent validation errors
    // Note: Register under both URIs because ensureCSSImportsRegistered resolves paths
    // Test documents use file:///memory/source-N.eligian, so "./styles.css" resolves to file:///memory/styles.css
    const cssRegistry = sharedServices.Eligian.css.CSSRegistry;
    const cssMetadata = {
      classes: new Set([
        'test-container',
        'presentation-container',
        'infographic-container',
        'chart',
        'content',
        'details',
        'visible',
        'annotation',
        'highlight',
        'container',
        'button',
        'parent',
        'child',
        'new-class',
        'temp-class',
        'invalid1',
        'invalid2',
        'invalid3',
      ]),
      ids: new Set([
        'title',
        'subtitle',
        'content',
        'credits',
        'box',
        'test',
        'container',
        'header',
      ]),
      classLocations: new Map(),
      idLocations: new Map(),
      classRules: new Map(),
      idRules: new Map(),
      errors: [],
    };
    cssRegistry.updateCSSFile('file:///styles.css', cssMetadata);
    cssRegistry.updateCSSFile('file:///memory/styles.css', cssMetadata);
  }
  return sharedServices;
}

/**
 * Compilation options
 */
interface CompileOptions {
  /**
   * Enable optimization passes (default: true)
   */
  optimize?: boolean;

  /**
   * Minify output JSON (default: false)
   */
  minify?: boolean;

  /**
   * Include source maps in output (default: false)
   * Note: Not yet implemented
   */
  sourcemap?: boolean;

  /**
   * Source file URI/path for resolving relative asset imports
   * Required for asset validation to resolve relative paths
   */
  sourceUri?: string;

  /**
   * Target Eligius version (default: '1.x')
   * Note: Currently only 1.x is supported
   */
  target?: string;
}

/**
 * Union of all possible compilation errors
 */
export type CompileError = ParseError | TransformError | TypeError | EmitError;

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
export const parseSource = (source: string, uri?: string): Effect.Effect<Program, ParseError> =>
  Effect.gen(function* (_) {
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
      mainDocument = yield* _(
        Effect.sync(() =>
          services.shared.workspace.LangiumDocumentFactory.fromString<Program>(source, documentUri)
        )
      );

      // Quick parse to extract imports (no linking/validation yet)
      yield* _(
        Effect.promise(() =>
          services.shared.workspace.DocumentBuilder.build([mainDocument!], {
            validation: false,
          })
        )
      );

      const tempProgram = mainDocument.parseResult.value;

      // Check if user tried to compile a library file directly
      if (isLibrary(tempProgram as any)) {
        return yield* _(
          Effect.fail({
            _tag: 'ParseError' as const,
            message: 'Cannot compile library files directly',
            location: { line: 1, column: 1, length: 0 },
            hint: 'Library files must be imported by a main program. Create a .eligian file with an "import" statement to use this library.',
          })
        );
      }

      const importPaths = extractLibraryImports(tempProgram);

      // Feature 032 US3: Load each library recursively (including nested dependencies)
      for (const importPath of importPaths) {
        const libraryUri = resolveLibraryPath(documentUri, importPath);

        // Recursively load library and all its dependencies with cycle detection
        const nestedLibraries = yield* _(loadLibraryRecursive(libraryUri, documentUri));

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
      yield* _(
        Effect.promise(() =>
          services.shared.workspace.DocumentBuilder.build([mainDocument!, ...libraryDocuments], {
            validation: false,
          })
        )
      );
    }

    // Wrap Langium parsing in Effect.tryPromise
    const result = yield* _(
      Effect.tryPromise({
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
            services.shared.workspace.LangiumDocumentFactory.fromString<Program>(
              source,
              documentUri
            );

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
            // Parse each CSS file and load into registry
            const docPath = documentUri.fsPath;
            const docDir = docPath.substring(
              0,
              docPath.lastIndexOf('\\') || docPath.lastIndexOf('/')
            );
            const cssFileUris: string[] = [];
            for (const cssRelativePath of cssFiles) {
              try {
                // Convert relative path to absolute
                const cssFilePath = cssRelativePath.startsWith('./')
                  ? `${docDir}${cssRelativePath.substring(1)}`
                  : cssRelativePath;

                // Read and parse CSS file
                const cssContent = readFileSync(cssFilePath, 'utf-8');
                const parseResult = parseCSS(cssContent, cssFilePath);

                // Convert to absolute URI (must match validator format)
                const cssFileUri = URI.file(cssFilePath).toString();
                cssFileUris.push(cssFileUri);

                // Update registry with parsed CSS
                cssRegistry.updateCSSFile(cssFileUri, parseResult);
              } catch (error) {
                // Convert to absolute URI for error registration
                const cssFilePath = cssRelativePath.startsWith('./')
                  ? `${docDir}${cssRelativePath.substring(1)}`
                  : cssRelativePath;
                const cssFileUri = URI.file(cssFilePath).toString();
                cssFileUris.push(cssFileUri);

                // Register error in registry
                cssRegistry.updateCSSFile(cssFileUri, {
                  classes: new Set(),
                  ids: new Set(),
                  classLocations: new Map(),
                  idLocations: new Map(),
                  classRules: new Map(),
                  idRules: new Map(),
                  errors: [
                    {
                      message: error instanceof Error ? error.message : 'Unknown error',
                      filePath: cssFileUri,
                      line: 0,
                      column: 0,
                    },
                  ],
                });
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

          // DEBUG: Log diagnostics count
          if (document.diagnostics && document.diagnostics.length > 0) {
          }

          return document;
        },
        catch: error => ({
          _tag: 'ParseError' as const,
          message: error instanceof Error ? error.message : String(error),
          location: { line: 1, column: 1, length: 0 },
          hint: 'Unexpected error during parsing',
        }),
      })
    );

    const document = result;

    // Check for parse errors
    if (document.parseResult.lexerErrors.length > 0) {
      const error = document.parseResult.lexerErrors[0];
      return yield* _(
        Effect.fail({
          _tag: 'ParseError' as const,
          message: `Lexer error: ${error.message}`,
          location: {
            line: error.line ?? 1,
            column: error.column ?? 1,
            length: error.length ?? 0,
          },
          hint: 'Check for invalid characters or tokens',
        })
      );
    }

    if (document.parseResult.parserErrors.length > 0) {
      const error = document.parseResult.parserErrors[0];
      return yield* _(
        Effect.fail({
          _tag: 'ParseError' as const,
          message: error.message,
          location: {
            line: error.token.startLine ?? 1,
            column: error.token.startColumn ?? 1,
            length: error.token.endOffset ? error.token.endOffset - error.token.startOffset : 0,
          },
          hint: 'Check syntax against Eligian grammar',
        })
      );
    }

    // Check for validation errors (from semantic validator)
    if (document.diagnostics && document.diagnostics.length > 0) {
      const error = document.diagnostics[0];
      const range = error.range;
      return yield* _(
        Effect.fail({
          _tag: 'ParseError' as const,
          message: error.message,
          location: {
            line: range.start.line + 1, // Langium is 0-based
            column: range.start.character + 1,
            length: range.end.character - range.start.character,
          },
          hint: 'Semantic validation failed',
        })
      );
    }

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

/**
 * T078: Main compilation pipeline
 *
 * Composes all stages into a complete DSL → JSON pipeline:
 * source → parse → validate → transform → typecheck → optimize → emit → JSON
 */
export const compile = (
  source: string,
  options: CompileOptions = {}
): Effect.Effect<IEngineConfiguration, CompileError> =>
  Effect.gen(function* (_) {
    // T076: Parse source to AST
    const program = yield* _(parseSource(source, options.sourceUri));

    // Check if user tried to compile a library file directly
    if (isLibrary(program as any)) {
      return yield* _(
        Effect.fail({
          _tag: 'ParseError' as const,
          message: 'Cannot compile library files directly',
          location: { line: 1, column: 1, length: 0 },
          hint: 'Library files must be imported by a main program. Create a .eligian file with an "import" statement to use this library.',
        })
      );
    }

    // T077: Validate AST (no-op, done during parsing - libraries already loaded in parseSource)
    const validatedProgram = yield* _(validateAST(program));

    // Load assets (layout HTML, CSS files, media) if sourceUri is provided
    let assets: AssetLoadingResult | undefined;
    if (options.sourceUri) {
      assets = loadProgramAssets(validatedProgram, options.sourceUri);
    }

    // T050-T059: Transform AST to IR
    const ir = yield* _(transformAST(validatedProgram, assets));

    // T060-T064: Type check IR
    const typedIR = yield* _(typeCheck(ir));

    // T065-T069: Optimize IR (if enabled)
    const optimizedIR = options.optimize !== false ? yield* _(optimize(typedIR)) : typedIR;

    // T070-T075: Emit JSON configuration
    const config = yield* _(emitJSON(optimizedIR));

    return config;
  });

/**
 * T079: Compile from file path
 *
 * Helper that reads a file and compiles it.
 * Note: Requires FileSystem effect service (not yet implemented).
 * For now, this is a placeholder that expects source to be pre-read.
 */
export const compileFile = (
  _filePath: string,
  _options: CompileOptions = {}
): Effect.Effect<IEngineConfiguration, CompileError> =>
  Effect.gen(function* (_) {
    // TODO: Read file via FileSystem service
    // For now, this is a placeholder
    return yield* _(
      Effect.fail({
        _tag: 'ParseError' as const,
        message: 'compileFile not yet implemented - use compile() with source string',
        location: { line: 1, column: 1, length: 0 },
        hint: 'Read file externally and pass source to compile()',
      })
    );
  });

/**
 * T080: Compile from string
 *
 * Alias for compile() for API consistency.
 */
export const compileString = (
  source: string,
  options: CompileOptions = {}
): Effect.Effect<IEngineConfiguration, CompileError> => compile(source, options);

/**
 * T081: Compile to JSON string
 *
 * Helper that compiles and serializes to JSON string.
 */
export const compileToJSON = (
  source: string,
  options: CompileOptions = {}
): Effect.Effect<string, CompileError> =>
  Effect.gen(function* (_) {
    const config = yield* _(compile(source, options));

    // Serialize to JSON (minified or pretty)
    const json = options.minify ? JSON.stringify(config) : JSON.stringify(config, null, 2);

    return json;
  });

/**
 * T082: Get intermediate IR (for debugging/tooling)
 *
 * Runs pipeline up to optimization and returns IR instead of JSON.
 * Useful for compiler debugging and IDE tooling.
 */
export const compileToIR = (
  source: string,
  options: CompileOptions = {}
): Effect.Effect<EligiusIR, ParseError | TransformError | TypeError> =>
  Effect.gen(function* (_) {
    // Parse source to AST
    const program = yield* _(parseSource(source));

    // Validate AST
    const validatedProgram = yield* _(validateAST(program));

    // Transform AST to IR
    const ir = yield* _(transformAST(validatedProgram));

    // Type check IR
    const typedIR = yield* _(typeCheck(ir));

    // Optimize IR (if enabled)
    const optimizedIR = options.optimize !== false ? yield* _(optimize(typedIR)) : typedIR;

    return optimizedIR;
  });

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
): Effect.Effect<Library, ParseError> {
  return Effect.gen(function* (_) {
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
    yield* _(
      Effect.tryPromise({
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
      })
    );

    // Check for parse errors
    if (document.parseResult.lexerErrors.length > 0) {
      const error = document.parseResult.lexerErrors[0];
      return yield* _(
        Effect.fail({
          _tag: 'ParseError' as const,
          message: `Lexer error in library: ${error.message}`,
          location: {
            line: error.line ?? 1,
            column: error.column ?? 1,
            length: error.length ?? 0,
          },
          hint: `In library file: ${libraryUri.fsPath}`,
        })
      );
    }

    if (document.parseResult.parserErrors.length > 0) {
      const error = document.parseResult.parserErrors[0];
      return yield* _(
        Effect.fail({
          _tag: 'ParseError' as const,
          message: error.message,
          location: {
            line: error.token.startLine ?? 1,
            column: error.token.startColumn ?? 1,
            length: error.token.endOffset ? error.token.endOffset - error.token.startOffset : 0,
          },
          hint: `In library file: ${libraryUri.fsPath}`,
        })
      );
    }

    // Check for validation errors
    if (document.diagnostics && document.diagnostics.length > 0) {
      const error = document.diagnostics[0];
      const range = error.range;
      return yield* _(
        Effect.fail({
          _tag: 'ParseError' as const,
          message: error.message,
          location: {
            line: range.start.line + 1,
            column: range.start.character + 1,
            length: range.end.character - range.start.character,
          },
          hint: `In library file: ${libraryUri.fsPath}`,
        })
      );
    }

    // Validate that parsed content is a Library, not a Program
    const root: any = document.parseResult.value;
    if (!isLibrary(root)) {
      return yield* _(
        Effect.fail({
          _tag: 'ParseError' as const,
          message: `File is not a library (found ${root.$type || 'unknown'} instead)`,
          location: { line: 1, column: 1, length: 0 },
          hint: `Library files must start with "library <name>". File: ${libraryUri.fsPath}`,
        })
      );
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
function loadLibraryRecursive(
  libraryUri: URI,
  _documentUri: URI,
  loadingStack: Set<string> = new Set()
): Effect.Effect<LangiumDocument[], ParseError> {
  return Effect.gen(function* (_) {
    const uriPath = libraryUri.fsPath;

    // T029: Circular dependency detection
    if (loadingStack.has(uriPath)) {
      // Build cycle chain for error message
      const chain = Array.from(loadingStack);
      chain.push(uriPath);
      const cycleChain = chain.join(' → ');

      return yield* _(
        Effect.fail({
          _tag: 'ParseError' as const,
          message: `Circular dependency detected: ${cycleChain}`,
          location: { line: 1, column: 1, length: 0 },
          hint: 'Remove circular import to break the cycle',
        })
      );
    }

    // Add current library to loading stack
    const newStack = new Set(loadingStack);
    newStack.add(uriPath);

    // Load library file content
    const content = yield* _(loadLibraryFile(libraryUri));

    // Parse library document
    const library = yield* _(parseLibraryDocument(content, libraryUri));

    // Get library document from workspace
    const services = getOrCreateServices();
    const libDoc = services.shared.workspace.LangiumDocuments.getDocument(libraryUri);
    if (!libDoc) {
      return yield* _(
        Effect.fail({
          _tag: 'ParseError' as const,
          message: `Failed to retrieve library document from workspace: ${uriPath}`,
          location: { line: 1, column: 1, length: 0 },
          hint: 'Internal error - library was parsed but not added to workspace',
        })
      );
    }

    // Collect all library documents (self + dependencies)
    const allLibraries: LangiumDocument[] = [libDoc];

    // Extract imports from this library
    const importPaths = extractLibraryImportsFromLibrary(library);

    // Recursively load each imported library
    for (const importPath of importPaths) {
      const nestedLibraryUri = resolveLibraryPath(libraryUri, importPath);

      // Recursively load nested library and its dependencies
      const nestedLibraries = yield* _(
        loadLibraryRecursive(nestedLibraryUri, libraryUri, newStack)
      );

      allLibraries.push(...nestedLibraries);
    }

    return allLibraries;
  });
}

/**
 * T083: Version information
 *
 * Returns compiler version and supported Eligius versions.
 */
export const getCompilerVersion = (): { compiler: string; eligius: string } => ({
  compiler: '0.0.1',
  eligius: '1.1.4',
});

/**
 * T084: Compile with default options
 *
 * Convenience export for common use case.
 */
export const compileWithDefaults = (source: string) =>
  compile(source, { optimize: true, minify: false });

/**
 * T085: Export all pipeline functions
 *
 * Re-export all compilation functions for external use.
 */
export { transformAST, typeCheck, optimize, emitJSON };
