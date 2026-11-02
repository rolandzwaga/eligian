/**
 * The Eligius lint findings the language server sends (ELIGIUS_LINT_NOTIFICATION),
 * shown in a diagnostic collection of their own ('eligius-lint'), so the
 * server's validations do not replace them while typing.
 */
import { ELIGIUS_LINT_NOTIFICATION, type EligiusLintParams } from '@eligian/language';
import * as vscode from 'vscode';
import type { LanguageClient } from 'vscode-languageclient/node.js';

/** A finding as the server sends it (an LSP diagnostic) */
type Diagnostic = EligiusLintParams['files'][number]['diagnostics'][number];

/**
 * The findings per program, merged per file: a library used by two programs
 * gets the findings of both, a finding reported by both once.
 */
export class EligiusLintStore {
  private readonly programs = new Map<string, Map<string, Diagnostic[]>>();

  /** Replace a program's findings; returns the files whose findings may have changed. */
  update(params: EligiusLintParams): string[] {
    const before = this.programs.get(params.programUri);
    const files = new Map(params.files.map(f => [f.uri, f.diagnostics] as const));
    if (files.size > 0) {
      this.programs.set(params.programUri, files);
    } else {
      this.programs.delete(params.programUri);
    }
    return [...new Set([...(before?.keys() ?? []), ...files.keys()])];
  }

  /** The findings in a file, of every program. */
  get(uri: string): Diagnostic[] {
    const seen = new Set<string>();
    const result: Diagnostic[] = [];
    for (const files of this.programs.values()) {
      for (const diagnostic of files.get(uri) ?? []) {
        const { start, end } = diagnostic.range;
        const key = `${start.line}:${start.character}-${end.line}:${end.character} ${diagnostic.code}`;
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(diagnostic);
      }
    }
    return result;
  }
}

function toVscode(diagnostic: Diagnostic): vscode.Diagnostic {
  const { start, end } = diagnostic.range;
  const result = new vscode.Diagnostic(
    new vscode.Range(start.line, start.character, end.line, end.character),
    diagnostic.message,
    diagnostic.severity === 1 ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning
  );
  result.source = diagnostic.source;
  if (diagnostic.code !== undefined) result.code = diagnostic.code;
  return result;
}

/** Show the language server's Eligius lint findings in Problems. */
export function registerEligiusLintDiagnostics(client: LanguageClient): vscode.Disposable {
  const collection = vscode.languages.createDiagnosticCollection('eligius-lint');
  const store = new EligiusLintStore();
  const listener = client.onNotification(ELIGIUS_LINT_NOTIFICATION, (params: EligiusLintParams) => {
    for (const uri of store.update(params)) {
      const findings = store.get(uri);
      const target = vscode.Uri.parse(uri);
      if (findings.length > 0) {
        collection.set(target, findings.map(toVscode));
      } else {
        collection.delete(target);
      }
    }
  });
  return vscode.Disposable.from(listener, collection);
}
