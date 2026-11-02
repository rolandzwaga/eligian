/**
 * Eligius' configuration lint (`eligius/lint`) in the language server.
 *
 * Every program is linted {@link LINT_DELAY} ms after its last validation (a
 * debounce: one run when typing pauses), on the documents the server already
 * parsed: the program is compiled in memory (nothing is written or bundled)
 * and the compiled configuration linted, as `eligian check` does. The findings
 * go to the extension (`ELIGIUS_LINT_NOTIFICATION`, sent by main.ts), per file: the
 * program, and the libraries whose actions it uses.
 *
 * A program with errors is not linted (its findings are cleared): it does not
 * compile, and its errors come first. Setting `eligian.validation.eligiusLint`.
 */
import {
  type EligianServices,
  type EligiusLintParams,
  isProgram,
  lintFindingsToParams,
  tryCompileProgramWithMap,
} from '@eligian/language';
import { lintCompiledConfig } from '@eligian/language/eligius-lint';
import { type Disposable, DocumentState, type LangiumDocument, URI } from 'langium';

/** Milliseconds between a program's last validation and its lint */
export const LINT_DELAY = 200;

/** The lint findings of a program document (none when it has errors or the lint is off). */
export function lintDocument(
  services: EligianServices,
  document: LangiumDocument
): EligiusLintParams {
  const programUri = document.uri.toString();
  const root = document.parseResult.value;
  const clean =
    isProgram(root) &&
    document.parseResult.lexerErrors.length === 0 &&
    document.parseResult.parserErrors.length === 0 &&
    !(document.diagnostics ?? []).some(d => d.severity === 1);
  if (!clean || !services.validation.Settings.eligiusLint) {
    return { programUri, files: [] };
  }
  const compiled = tryCompileProgramWithMap(root, document.uri.fsPath);
  if (!compiled) {
    return { programUri, files: [] };
  }
  const documents = services.shared.workspace.LangiumDocuments;
  return lintFindingsToParams(
    programUri,
    lintCompiledConfig(compiled.config, compiled.map, compiled.host),
    file => URI.file(file).toString(),
    uri => documents.getDocument(URI.parse(uri))?.textDocument
  );
}

/**
 * Lint every Eligian program {@link LINT_DELAY} ms after its last validation
 * and send the findings; a deleted program sends none.
 */
export function registerEligiusLint(
  services: EligianServices,
  send: (params: EligiusLintParams) => void,
  delay = LINT_DELAY
): Disposable {
  const builder = services.shared.workspace.DocumentBuilder;
  const documents = services.shared.workspace.LangiumDocuments;
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  const run = (key: string) => {
    timers.delete(key);
    const document = documents.getDocument(URI.parse(key));
    // Another build is under way: its validation schedules the lint again
    if (!document || document.state < DocumentState.Validated) return;
    if (!isProgram(document.parseResult.value)) return;
    try {
      send(lintDocument(services, document));
    } catch (error) {
      // The lint is extra information: it must never take the server down
      console.error('[Eligius lint] failed:', error);
    }
  };

  const schedule = (document: LangiumDocument) => {
    if (!document.uri.path.endsWith('.eligian')) return;
    const key = document.uri.toString();
    clearTimeout(timers.get(key));
    timers.set(
      key,
      setTimeout(() => run(key), delay)
    );
  };

  const validated = builder.onDocumentPhase(DocumentState.Validated, schedule);
  const updated = builder.onUpdate((_changed, deleted) => {
    for (const uri of deleted) {
      const key = uri.toString();
      if (!key.endsWith('.eligian')) continue;
      clearTimeout(timers.get(key));
      timers.delete(key);
      send({ programUri: key, files: [] });
    }
  });

  return {
    dispose: () => {
      validated.dispose();
      updated.dispose();
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    },
  };
}
