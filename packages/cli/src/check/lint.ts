/**
 * `eligian check` runs Eligius' own configuration lint (`eligius/lint`) over
 * each program that checks without errors: the compiled configuration as the
 * engine would get it, with the host module's declared names. Each finding is
 * reported at the source of its JSON path through the Eligian map.
 *
 * Eligian checks the program, Eligius the JSON, so a lint finding is either
 * something Eligian does not check or a compiler bug. W111 ("a required
 * property that nothing provides", for lists that start with caller-owned
 * data) is left out: in a named action that data is the action's parameters,
 * and Eligian checks every call for them (the missing-action-dependency
 * dataflow).
 */
import type { CheckDiagnostic, EligianMap, HostModule } from '@eligian/language';
import { locateConfigPath } from '@eligian/language';
import type { IEngineConfiguration } from 'eligius';
import { type ILintDiagnostic, lintConfiguration } from 'eligius/lint';
import { compileFile } from '../compile-file.js';

/** Lint rules Eligian checks on the source already. */
const COVERED_BY_ELIGIAN = new Set(['W111']);

/** The Eligius lint findings of an Eligian program, at their source. */
export async function lintFile(file: string): Promise<CheckDiagnostic[]> {
  const { config, map, host } = await compileFile(file);
  return lintCompiled(file, config, map, host);
}

/** The Eligius lint findings of a compiled configuration, at their source. */
export function lintCompiled(
  file: string,
  config: IEngineConfiguration,
  map: EligianMap,
  host?: HostModule
): CheckDiagnostic[] {
  const findings = lintConfiguration(config, {
    customOperations: host?.operations ?? [],
    customControllers: host?.controllers ?? [],
    customFunctions: host?.functions ?? [],
  });
  return findings
    .filter(finding => !COVERED_BY_ELIGIAN.has(finding.code))
    .map(finding => toDiagnostic(file, finding, map, config));
}

function toDiagnostic(
  file: string,
  finding: ILintDiagnostic,
  map: EligianMap,
  config: IEngineConfiguration
): CheckDiagnostic {
  const location = locateConfigPath(map, config, finding.path);
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
    code: `eligius-${finding.code}`,
  };
}
