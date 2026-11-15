/**
 * `eligian check`: every diagnostic for a set of files.
 *
 * Unlike compile(), which stops at the first error, this loads all files (and
 * the libraries they import) into one workspace, validates them the way the
 * compiler and the IDE do, and returns every lexer, parser and validation
 * diagnostic with its severity. Programs without validation errors are also
 * compiled, so errors only the compiler finds (asset loading, transformation)
 * are reported too.
 */
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { Effect } from 'effect';
import type { LangiumDocument } from 'langium';
import { URI } from 'langium';
import { type Diagnostic, DiagnosticSeverity } from 'vscode-languageserver-protocol';
import type { EligianServices } from '../../eligian-module.js';
import { isLibrary, isProgram, type Library, type Program } from '../../generated/ast.js';
import { selectElementFix } from '../../lsp/select-element-fix.js';
import { type DiagnosticCode, diagnosticCode } from '../../validators/codes.js';
import type { SelectorNotInLayout } from '../../validators/validation-settings.js';
import { type CompileError, compile } from '../pipeline.js';
import {
  extractLibraryImports,
  extractLibraryImportsFromLibrary,
  resolveLibraryPath,
} from './library-loader.js';
import { loadCssImports, releaseWorkspaceDocuments } from './parser.js';
import { getOrCreateServices } from './services.js';

export type CheckSeverity = 'error' | 'warning' | 'info' | 'hint';

/**
 * An edit that fixes a diagnostic: replace the range with `newText`. 1-based,
 * like the diagnostic; start = end is an insertion.
 */
export interface QuickFix {
  readonly line: number;
  readonly column: number;
  readonly endLine: number;
  readonly endColumn: number;
  readonly newText: string;
}

/** What a diagnostic carries besides its message. */
export interface CheckDiagnosticData {
  /** The names a "Did you mean" hint offers */
  readonly suggestions?: readonly string[];
  readonly quickFix?: QuickFix;
}

/** One problem in one file. Lines and columns are 1-based. */
export interface CheckDiagnostic {
  readonly file: string;
  readonly severity: CheckSeverity;
  readonly message: string;
  readonly line: number;
  readonly column: number;
  readonly endLine: number;
  readonly endColumn: number;
  /** Diagnostic code (e.g. `missing-action-dependency`). */
  readonly code: string;
  /** Absent when there is nothing, so such a record is the same as before `data` existed. */
  readonly data?: CheckDiagnosticData;
}

export interface CheckFileResult {
  /** Absolute path of the checked file. */
  readonly file: string;
  /** In document order. */
  readonly diagnostics: readonly CheckDiagnostic[];
}

const SEVERITY: Record<number, CheckSeverity> = {
  [DiagnosticSeverity.Error]: 'error',
  [DiagnosticSeverity.Warning]: 'warning',
  [DiagnosticSeverity.Information]: 'info',
  [DiagnosticSeverity.Hint]: 'hint',
};

/**
 * Check `filePaths` (absolute or relative to the cwd). Never fails: unreadable
 * files and unexpected crashes are reported as error diagnostics of that file.
 */
export interface CheckOptions {
  /** `eligian.validation.selectorNotInLayout` for this check (default: off) */
  readonly selectorNotInLayout?: SelectorNotInLayout;
}

export const checkFiles = (
  filePaths: readonly string[],
  options: CheckOptions = {}
): Effect.Effect<readonly CheckFileResult[], never> =>
  Effect.promise(async () => {
    const files = [...new Set(filePaths.map(p => path.resolve(p)))];
    const results = new Map<string, CheckDiagnostic[]>(files.map(f => [f, []]));
    // The services are shared: set the option for this check only
    const settings = getOrCreateServices().Eligian.validation.Settings;
    const previous = settings.selectorNotInLayout;
    settings.selectorNotInLayout = options.selectorNotInLayout ?? 'off';
    let validated: Set<string>;
    try {
      validated = await validateFiles(files, results);
    } finally {
      settings.selectorNotInLayout = previous;
    }

    // Compile the programs that validate cleanly: compile-only errors
    for (const file of files) {
      const diagnostics = results.get(file)!;
      if (!validated.has(file) || diagnostics.some(d => d.severity === 'error')) continue;
      const failure = await Effect.runPromise(
        Effect.flip(compile(readFileSync(file, 'utf-8'), { sourceUri: file })).pipe(
          Effect.orElseSucceed(() => undefined)
        )
      );
      if (failure) diagnostics.push(compileDiagnostic(file, failure));
    }

    return files.map(file => ({ file, diagnostics: results.get(file)! }));
  });

interface CompileLocation {
  readonly file?: string;
  readonly line?: number;
  readonly column?: number;
  readonly length?: number;
}

const COMPILE_ERROR_CODES: Record<CompileError['_tag'], DiagnosticCode> = {
  ParseError: 'compile-parse-error',
  ValidationError: 'compile-validation-error',
  TypeError: 'compile-type-error',
  TransformError: 'compile-transform-error',
  EmitError: 'compile-emit-error',
};

/** One registry code per compile-error `_tag`; `kind` is ignored. */
export function compileErrorCode(error: Pick<CompileError, '_tag'>): DiagnosticCode {
  return COMPILE_ERROR_CODES[error._tag];
}

function compileDiagnostic(
  file: string,
  error: Pick<CompileError, '_tag' | 'message'> & { readonly location?: CompileLocation }
): CheckDiagnostic {
  const location = error.location ?? {};
  // A location in an imported library is reported on line 1 of the checked file
  const inThisFile = !location.file || path.resolve(location.file) === file;
  const line = inThisFile && location.line ? location.line : 1;
  const column = inThisFile && location.column ? location.column : 1;
  const message = inThisFile ? error.message : `${error.message} (in ${location.file})`;
  return {
    file,
    severity: 'error',
    message,
    line,
    column,
    endLine: line,
    endColumn: column + (inThisFile && location.length ? location.length : 0),
    code: compileErrorCode(error),
  };
}

/** The documents {@link withLoadedDocuments} loaded, while its callback runs. */
export interface LoadedDocuments {
  /** The shared compiler services: the singleton checkFiles and compileFile use */
  readonly services: EligianServices;
  /** The files and every library they import (transitively), by URI string */
  readonly documents: ReadonlyMap<string, LangiumDocument>;
  /** The document of one of `files`, by absolute path */
  readonly documentOf: (file: string) => LangiumDocument | undefined;
}

/**
 * Load `files` and their libraries into the shared workspace, link them, load their CSS
 * imports into the CSS registry, run `use`, then clear the CSS registrations and release
 * every loaded document (also when `use` throws). No validation is run.
 *
 * A file that cannot be read is skipped and reported through `onUnreadable`.
 */
export async function withLoadedDocuments<T>(
  files: readonly string[],
  use: (loaded: LoadedDocuments) => Promise<T> | T,
  onUnreadable?: (file: string, error: unknown) => void
): Promise<T> {
  const services = getOrCreateServices();
  const { LangiumDocumentFactory, LangiumDocuments, DocumentBuilder } = services.shared.workspace;
  const cssRegistry = services.Eligian.css.CSSRegistry;
  const documents = new Map<string, LangiumDocument>();

  const addDocument = (fsPath: string): LangiumDocument | undefined => {
    const uri = URI.file(fsPath);
    const key = uri.toString();
    const existing = documents.get(key);
    if (existing) return existing;
    let content: string;
    try {
      content = readFileSync(fsPath, 'utf-8');
    } catch (error) {
      onUnreadable?.(fsPath, error);
      return undefined;
    }
    const document = LangiumDocumentFactory.fromString(content, uri);
    // Registered so the import validator and the scope provider find libraries
    if (LangiumDocuments.hasDocument(uri)) LangiumDocuments.deleteDocument(uri);
    LangiumDocuments.addDocument(document);
    documents.set(key, document);
    return document;
  };

  try {
    for (const file of files) addDocument(file);

    // Pull in imported libraries (transitively), so imports link as in the compiler
    const pending = [...documents.values()];
    await DocumentBuilder.build(pending, { validation: false });
    while (pending.length > 0) {
      const document = pending.pop()!;
      const root = document.parseResult.value;
      const imports = isLibrary(root)
        ? extractLibraryImportsFromLibrary(root as Library)
        : isProgram(root)
          ? extractLibraryImports(root as Program)
          : [];
      for (const importPath of imports) {
        const libraryUri = resolveLibraryPath(document.uri, importPath);
        if (documents.has(libraryUri.toString())) continue;
        const library = addDocument(libraryUri.fsPath);
        if (!library) continue; // missing files are reported by the import validator
        await DocumentBuilder.build([library], { validation: false });
        pending.push(library);
      }
    }

    // Relink everything together now that every library is indexed
    const all = [...documents.values()];
    for (const document of all) DocumentBuilder.resetToState(document, 1); // Parsed
    await DocumentBuilder.build(all, { validation: false });

    for (const document of all) {
      cssRegistry.clearDocument(document.uri.toString());
      if (isProgram(document.parseResult.value)) loadCssImports(document, cssRegistry);
    }

    return await use({
      services: services.Eligian,
      documents,
      documentOf: file => documents.get(URI.file(file).toString()),
    });
  } finally {
    for (const document of documents.values()) {
      cssRegistry.clearDocument(document.uri.toString());
    }
    releaseWorkspaceDocuments([...documents.values()].map(d => d.uri));
  }
}

/**
 * Load, link and validate the files plus every library they import, recording
 * the diagnostics of `files`. Returns the programs that were validated (library
 * files are validated but not compiled).
 */
function validateFiles(
  files: readonly string[],
  results: Map<string, CheckDiagnostic[]>
): Promise<Set<string>> {
  return withLoadedDocuments(
    files,
    async loaded => {
      const programs = new Set<string>();
      for (const file of files) {
        const document = loaded.documentOf(file);
        if (!document) continue;
        const diagnostics =
          await loaded.services.validation.DocumentValidator.validateDocument(document);
        const target = results.get(file)!;
        for (const diagnostic of diagnostics) {
          const data = dataOf(document, diagnostic);
          target.push({
            file,
            severity: SEVERITY[diagnostic.severity ?? DiagnosticSeverity.Error] ?? 'error',
            message: diagnostic.message,
            line: diagnostic.range.start.line + 1,
            column: diagnostic.range.start.character + 1,
            endLine: diagnostic.range.end.line + 1,
            endColumn: diagnostic.range.end.character + 1,
            code: codeOf(diagnostic),
            ...(data && { data }),
          });
        }
        if (isProgram(document.parseResult.value)) programs.add(file);
      }
      return programs;
    },
    (file, error) => {
      results.get(file)?.push({
        file,
        severity: 'error',
        message: `Cannot read file: ${error instanceof Error ? error.message : String(error)}`,
        line: 1,
        column: 1,
        endLine: 1,
        endColumn: 1,
        code: diagnosticCode('file-unreadable'),
      });
    }
  );
}

/** `data.suggestions` (a `string[]`) and the selectElement quick fix; undefined when neither exists. */
function dataOf(
  document: LangiumDocument,
  diagnostic: Diagnostic
): CheckDiagnosticData | undefined {
  const raw = (diagnostic.data as { suggestions?: unknown } | undefined)?.suggestions;
  const suggestions =
    Array.isArray(raw) && raw.every(s => typeof s === 'string') ? (raw as string[]) : undefined;
  const fix = selectElementFix(document, diagnostic);
  const quickFix: QuickFix | undefined = fix && {
    line: fix.range.start.line + 1,
    column: fix.range.start.character + 1,
    endLine: fix.range.end.line + 1,
    endColumn: fix.range.end.character + 1,
    newText: fix.newText,
  };
  if (!suggestions && !quickFix) return undefined;
  return { ...(suggestions && { suggestions }), ...(quickFix && { quickFix }) };
}

/** `code`, else `data.code`; `'uncoded'` (not a registry code) when there is neither. */
function codeOf(diagnostic: { code?: unknown; data?: unknown }): string {
  const code = diagnostic.code ?? (diagnostic.data as { code?: unknown } | undefined)?.code;
  return typeof code === 'string' || typeof code === 'number' ? String(code) : 'uncoded';
}
