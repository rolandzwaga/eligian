/**
 * On-demand loading of imported libraries that are not in the workspace.
 *
 * Regression test for the audit finding (2026-10-22, medium) "Imports of
 * libraries outside the loaded workspace never resolve in the IDE (no
 * on-demand document loading)": the scope provider and import validator only
 * look in `LangiumDocuments`, and nothing loaded a library that lives outside
 * the workspace folders, so `import { x } from "../shared/lib.eligian"` gave
 * "Library file not found" and unresolved calls in the editor while the CLI
 * compiled the file.
 *
 * The library files below exist only in the (mock) file system, never added
 * to `LangiumDocuments`, which is the IDE situation for a file outside the
 * workspace folders.
 */

import { AstUtils, DocumentState, type LangiumDocument, URI } from 'langium';
import { parseHelper } from 'langium/test';
import { describe, expect, test } from 'vitest';
import { createEligianServices } from '../eligian-module.js';
import { isOperationCall, type OperationCall, type Program } from '../generated/ast.js';
import { getOperationCallName } from '../utils/operation-call-utils.js';
import { createMockFileSystem } from './mock-file-system.js';
import { DiagnosticSeverity } from './test-helpers.js';

const SHARED_LIB = 'file:///outside/shared/lib.eligian';
const SHARED_NESTED = 'file:///outside/shared/nested.eligian';

function setup(loadImportedLibraries?: boolean) {
  const { fileSystemProvider, fs } = createMockFileSystem();
  const services = createEligianServices(
    loadImportedLibraries === undefined
      ? { fileSystemProvider }
      : { fileSystemProvider, loadImportedLibraries }
  );
  const parse = parseHelper<Program>(services.Eligian);
  let counter = 0;
  const program = async (code: string): Promise<LangiumDocument<Program>> => {
    const document = await parse(code, {
      documentUri: `file:///outside/app/main-${++counter}.eligian`,
    });
    await services.shared.workspace.DocumentBuilder.build([document], { validation: true });
    return document;
  };
  return { services, fs, program };
}

/** Error messages, without CSS diagnostics (no stylesheet is imported here). */
function errorsOf(document: LangiumDocument): string[] {
  return (document.diagnostics ?? [])
    .filter(d => d.severity === DiagnosticSeverity.Error)
    .map(d => d.message)
    .filter(message => !message.startsWith('Unknown CSS'));
}

function callNamed(document: LangiumDocument, name: string): OperationCall {
  const call = AstUtils.streamAst(document.parseResult.value)
    .filter(isOperationCall)
    .find(c => getOperationCallName(c) === name);
  if (!call) throw new Error(`No call to '${name}'`);
  return call;
}

const PROGRAM = `
  import { fadeIn } from "../shared/lib.eligian"

  timeline "T" in "#app" using raf {
    at 0s..1s fadeIn("#box", 100)
  }
`;

const LIBRARY = `
  library shared

  import { prep } from "./nested.eligian"

  action fadeIn(selector: string, duration: number) [
    prep(selector)
    selectElement(selector)
    animate({opacity: 1}, duration)
  ]
`;

const NESTED = `
  library nested

  action prep(selector: string) [
    selectElement(selector)
  ]
`;

describe('On-demand loading of imported libraries (IDE)', () => {
  test('a library outside the workspace is loaded and its actions resolve', async () => {
    const { services, fs, program } = setup(true);
    fs.writeFile(SHARED_LIB, LIBRARY);
    fs.writeFile(SHARED_NESTED, NESTED);

    const doc = await program(PROGRAM);

    expect(errorsOf(doc)).toEqual([]);
    const target = callNamed(doc, 'fadeIn').operationName.ref;
    expect(target?.name).toBe('fadeIn');
    expect(target && AstUtils.getDocument(target).uri.toString()).toBe(SHARED_LIB);

    // The loaded libraries (including the nested one) are built too, with the
    // options of the build that loaded them (parseHelper's first build does
    // not validate).
    const documents = services.shared.workspace.LangiumDocuments;
    const library = documents.getDocument(URI.parse(SHARED_LIB));
    const nested = documents.getDocument(URI.parse(SHARED_NESTED));
    expect(library?.state).toBeGreaterThanOrEqual(DocumentState.IndexedReferences);
    expect(nested?.state).toBeGreaterThanOrEqual(DocumentState.IndexedReferences);
    expect(library && callNamed(library, 'prep').operationName.ref?.name).toBe('prep');
  });

  test('the language server update path loads, builds and validates the libraries', async () => {
    const { services, fs } = setup(true);
    const programUri = URI.parse('file:///outside/app/opened.eligian');
    fs.writeFile(programUri, PROGRAM);
    fs.writeFile(SHARED_LIB, LIBRARY);
    fs.writeFile(SHARED_NESTED, NESTED);

    // What the language server does for a changed / opened document
    await services.shared.workspace.DocumentBuilder.update([programUri], []);

    const documents = services.shared.workspace.LangiumDocuments;
    const doc = documents.getDocument(programUri);
    const library = documents.getDocument(URI.parse(SHARED_LIB));
    const nested = documents.getDocument(URI.parse(SHARED_NESTED));
    expect(doc && errorsOf(doc)).toEqual([]);
    expect(doc && callNamed(doc, 'fadeIn').operationName.ref?.name).toBe('fadeIn');
    expect(library?.state).toBe(DocumentState.Validated);
    expect(nested?.state).toBe(DocumentState.Validated);
    expect(library && errorsOf(library)).toEqual([]);
  });

  test('import cycles between loaded libraries terminate', async () => {
    const { fs, program } = setup(true);
    fs.writeFile(
      SHARED_LIB,
      `
        library shared
        import { prep } from "./nested.eligian"
        action fadeIn(selector: string, duration: number) [
          prep(selector)
        ]
      `
    );
    fs.writeFile(
      SHARED_NESTED,
      `
        library nested
        import { fadeIn } from "./lib.eligian"
        action prep(selector: string) [
          selectElement(selector)
        ]
      `
    );

    const doc = await program(PROGRAM);

    expect(callNamed(doc, 'fadeIn').operationName.ref?.name).toBe('fadeIn');
    expect(errorsOf(doc).filter(m => m.includes('Library file not found'))).toEqual([]);
  });

  test('a library missing from disk is still reported as not found', async () => {
    const { program } = setup(true);

    const doc = await program(PROGRAM);

    expect(errorsOf(doc).some(m => m.includes('Library file not found'))).toBe(true);
    expect(callNamed(doc, 'fadeIn').operationName.ref).toBeUndefined();
  });

  test('loading is off by default outside a language server (compiler loads libraries itself)', async () => {
    const { services, fs, program } = setup();
    fs.writeFile(SHARED_LIB, LIBRARY);

    const doc = await program(PROGRAM);

    expect(errorsOf(doc).some(m => m.includes('Library file not found'))).toBe(true);
    expect(services.shared.workspace.LangiumDocuments.hasDocument(URI.parse(SHARED_LIB))).toBe(
      false
    );
  });

  test('a library loaded by an earlier build is reused, not reloaded', async () => {
    const { services, fs, program } = setup(true);
    fs.writeFile(SHARED_LIB, LIBRARY);
    fs.writeFile(SHARED_NESTED, NESTED);

    await program(PROGRAM);
    const first = services.shared.workspace.LangiumDocuments.getDocument(URI.parse(SHARED_LIB));
    const doc = await program(PROGRAM);
    const second = services.shared.workspace.LangiumDocuments.getDocument(URI.parse(SHARED_LIB));

    expect(errorsOf(doc)).toEqual([]);
    expect(second).toBe(first);
  });
});
