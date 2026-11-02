import type { Diagnostic } from 'vscode-languageserver-types';
import type { EligiusLintFinding } from '../compiler/eligius-lint.js';

/**
 * Eligius' configuration lint in the editor.
 *
 * The language server lints every program a while after it was validated and
 * sends the findings with this notification; the extension shows them in a
 * diagnostic collection of its own. Not in the server's own diagnostics: those
 * are replaced on every validation, so the findings would flicker while typing.
 */
export const ELIGIUS_LINT_NOTIFICATION = 'eligian/eligiusLint';

/** The findings of one program: they replace everything sent for it before. */
export interface EligiusLintParams {
  /** The program that was linted */
  programUri: string;
  /** Its findings per file: the program, and the libraries whose actions it uses */
  files: Array<{ uri: string; diagnostics: Diagnostic[] }>;
}

/** The diagnostic source of a lint finding */
export const ELIGIUS_LINT_SOURCE = 'Eligius lint';

/**
 * The findings of a program as diagnostics, per file.
 *
 * @param fileUri - the URI of a file in a finding's location (`location.file`)
 * @param text - the text positions of a file, for the end of a finding's range
 *   (its location's length); without them the range is one character long
 */
export function lintFindingsToParams(
  programUri: string,
  findings: readonly EligiusLintFinding[],
  fileUri: (file: string) => string,
  text?: (uri: string) => TextPositions | undefined
): EligiusLintParams {
  const files = new Map<string, Diagnostic[]>();
  for (const finding of findings) {
    const { location } = finding;
    const uri = location?.file ? fileUri(location.file) : programUri;
    const line = Math.max(0, (location?.line ?? 1) - 1);
    const character = Math.max(0, (location?.column ?? 1) - 1);
    const positions = location ? text?.(uri) : undefined;
    const end = positions
      ? positions.positionAt(positions.offsetAt({ line, character }) + (location?.length ?? 1))
      : { line, character: character + 1 };
    const list = files.get(uri) ?? [];
    list.push({
      range: { start: { line, character }, end },
      severity: finding.severity === 'error' ? 1 : 2,
      source: ELIGIUS_LINT_SOURCE,
      code: finding.rule,
      message: `${finding.message} (at ${finding.path || 'the configuration'} in the compiled JSON)`,
    });
    files.set(uri, list);
  }
  return {
    programUri,
    files: [...files].map(([uri, diagnostics]) => ({ uri, diagnostics })),
  };
}

/** Offsets and positions of a file's text (a TextDocument has both). */
export interface TextPositions {
  offsetAt(position: { line: number; character: number }): number;
  positionAt(offset: number): { line: number; character: number };
}
