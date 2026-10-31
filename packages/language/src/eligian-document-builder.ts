/**
 * Document builder that loads imported library files on demand.
 *
 * Langium's workspace manager only loads the files inside the workspace
 * folders (plus open editors). A library imported from outside them, e.g.
 * `import { x } from "../shared/lib.eligian"` with only `app/` open, was never
 * loaded, so the import and every call to its actions stayed unresolved in the
 * IDE while `eligian compile` (which loads libraries itself) succeeded.
 *
 * Loading happens during the build, never during scope resolution (the scope
 * provider is synchronous and only reads `LangiumDocuments`):
 *
 * 1. After the parse phase of a build, the library imports of every parsed
 *    Program / Library are resolved (same path logic as the compiler). Each
 *    one that is not loaded yet but exists on disk is read with
 *    `LangiumDocuments.getOrCreateDocument`, and its own imports are followed
 *    the same way. A library already in `LangiumDocuments` is never loaded
 *    again, which also stops import cycles.
 * 2. Linking of the importing documents then runs in the same build and finds
 *    the freshly parsed libraries.
 * 3. When that build completes, the loaded libraries are built themselves
 *    (indexed, linked, validated) with the same build options, so they take
 *    part in the index like any workspace document.
 *
 * No nested `update()` call is made and nothing blocks: every step is awaited
 * inside the running build and honours its cancellation token. A build that
 * is cancelled leaves the loaded documents unbuilt; Langium's next update
 * rebuilds every document whose build did not complete.
 *
 * Enabled for the language server only (see `createEligianServices`): the
 * compiler loads libraries through its own library loader.
 *
 * Relinking also follows library imports transitively (see {@link shouldRelink}):
 * diagnostics such as `circular_library_import` depend on libraries a document
 * only reaches through other libraries, which Langium's reference-based check misses.
 */

import {
  type BuildOptions,
  type Cancellation,
  DefaultDocumentBuilder,
  DocumentState,
  interruptAndCheck,
  isOperationCancelled,
  type LangiumDocument,
  type LangiumSharedCoreServices,
} from 'langium';
import { resolveLibraryPath } from './compiler/pipeline.js';
import { isLibrary, isProgram } from './generated/ast.js';
import { getLibraryImportsOf } from './utils/action-scope.js';

type CancellationToken = Cancellation.CancellationToken;

export class EligianDocumentBuilder extends DefaultDocumentBuilder {
  /** Libraries loaded during a build that still need building themselves. */
  private readonly loadedLibraries: LangiumDocument[] = [];

  constructor(services: LangiumSharedCoreServices, loadImportedLibraries: boolean) {
    super(services);
    if (loadImportedLibraries) {
      this.onBuildPhase(DocumentState.Parsed, (documents, cancelToken) =>
        this.loadImportedLibraries(documents, cancelToken)
      );
    }
  }

  protected override async buildDocuments(
    documents: LangiumDocument[],
    options: BuildOptions,
    cancelToken: CancellationToken
  ): Promise<void> {
    await super.buildDocuments(documents, options, cancelToken);

    // Build the libraries loaded by that build. Building them runs the parse
    // phase listener again, which only loads libraries not loaded yet, so this
    // ends once no new library file is found.
    while (this.loadedLibraries.length > 0) {
      const libraries = this.loadedLibraries
        .splice(0)
        .filter(
          library =>
            library.state < DocumentState.Validated &&
            this.langiumDocuments.getDocument(library.uri) === library
        );
      if (libraries.length > 0) {
        await super.buildDocuments(libraries, options, cancelToken);
      }
    }
  }

  /**
   * Also relink (and so revalidate) a document when a library it imports directly or
   * through other libraries changed or was deleted. Langium only relinks documents with
   * linking errors or references into the changed documents, so e.g. a program importing
   * `a`, where `a → b → a` is a cycle, kept its `circular_library_import` error after
   * `b` dropped its import of `a`.
   */
  protected override shouldRelink(document: LangiumDocument, changedUris: Set<string>): boolean {
    return (
      super.shouldRelink(document, changedUris) || this.importsChangedLibrary(document, changedUris)
    );
  }

  /** Whether `document` transitively imports a library whose URI is in `changedUris`. */
  private importsChangedLibrary(document: LangiumDocument, changedUris: Set<string>): boolean {
    const visited = new Set<string>([document.uri.toString()]);
    const queue: LangiumDocument[] = [document];
    for (let current = queue.shift(); current; current = queue.shift()) {
      const root = current.parseResult?.value;
      if (!isProgram(root) && !isLibrary(root)) {
        continue;
      }
      for (const libraryImport of getLibraryImportsOf(root)) {
        if (!libraryImport.path) {
          continue;
        }
        const uri = resolveLibraryPath(current.uri, libraryImport.path);
        const key = uri.toString();
        if (changedUris.has(key)) {
          return true;
        }
        if (visited.has(key)) {
          continue;
        }
        visited.add(key);
        const library = this.langiumDocuments.getDocument(uri);
        if (library) {
          queue.push(library);
        }
      }
    }
    return false;
  }

  /**
   * Load the libraries that `documents` import, directly or through other
   * libraries, that are not in `LangiumDocuments` yet.
   */
  protected async loadImportedLibraries(
    documents: readonly LangiumDocument[],
    cancelToken: CancellationToken
  ): Promise<void> {
    const queue = [...documents];
    for (let document = queue.shift(); document; document = queue.shift()) {
      const root = document.parseResult?.value;
      if (!isProgram(root) && !isLibrary(root)) {
        continue;
      }
      for (const libraryImport of getLibraryImportsOf(root)) {
        if (!libraryImport.path) {
          continue; // Partial AST while typing `import { a } from`
        }
        const library = await this.loadLibrary(
          resolveLibraryPath(document.uri, libraryImport.path),
          cancelToken
        );
        if (library) {
          this.loadedLibraries.push(library);
          queue.push(library);
        }
      }
    }
  }

  /**
   * Read and parse the library at `uri` if it is not loaded yet and exists.
   * Returns the new document, or `undefined` when nothing was loaded (already
   * loaded, missing, not an Eligian file, or unreadable: the import validator
   * reports a missing library).
   */
  private async loadLibrary(
    uri: LangiumDocument['uri'],
    cancelToken: CancellationToken
  ): Promise<LangiumDocument | undefined> {
    if (this.langiumDocuments.hasDocument(uri) || !this.serviceRegistry.hasServices(uri)) {
      return undefined;
    }
    await interruptAndCheck(cancelToken);
    try {
      if (!(await this.fileSystemProvider.exists(uri))) {
        return undefined;
      }
      // Another document of this build may have loaded it meanwhile.
      if (this.langiumDocuments.hasDocument(uri)) {
        return undefined;
      }
      return await this.langiumDocuments.getOrCreateDocument(uri, cancelToken);
    } catch (error) {
      if (isOperationCancelled(error)) {
        throw error;
      }
      return undefined;
    }
  }
}
