/**
 * `eligian check` runs Eligius' configuration lint (`eligius/lint`) over each
 * program that checks without errors, through `lintCompiledConfig` (shared
 * with the VS Code preview), and reports each finding at its source with the
 * code `eligius-<rule>`.
 */
import type { CheckDiagnostic } from '@eligian/language';
import { type EligiusLintFinding, lintCompiledConfig } from '@eligian/language/eligius-lint';
import { compileFile } from '../compile-file.js';

/** The Eligius lint findings of an Eligian program, at their source. */
export async function lintFile(file: string): Promise<CheckDiagnostic[]> {
  const { config, map, host } = await compileFile(file);
  return lintCompiledConfig(config, map, host).map(finding => toDiagnostic(file, finding));
}

function toDiagnostic(file: string, finding: EligiusLintFinding): CheckDiagnostic {
  const { location } = finding;
  const line = location?.line ?? 1;
  const column = location?.column ?? 1;
  return {
    file: location?.file ?? file,
    severity: finding.severity,
    message: `${finding.message} (Eligius lint at ${finding.path || 'the configuration'})`,
    line,
    column,
    endLine: line,
    endColumn: column + (location?.length ?? 1),
    code: `eligius-${finding.rule}`,
  };
}
