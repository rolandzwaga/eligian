/**
 * Eligius' configuration lint (`eligius/lint`) over a compiled program, with
 * each finding located at its .eligian source through the Eligian map. Used
 * by `eligian check` and the VS Code preview. Imported as
 * `@eligian/language/eligius-lint` (a bundle of its own), not from the
 * package root: the language server would carry the resolver otherwise.
 *
 * Eligian checks the program, Eligius the JSON, so a finding is either
 * something Eligian does not check (a literal outside an operation's allowed
 * values, an `$operationdata` read nothing provides) or a compiler bug. W111
 * ("a required property that nothing provides", for lists that start with
 * caller-owned data) is left out: in a named action that data is the action's
 * parameters, and Eligian checks every call for them (the
 * missing-action-dependency dataflow).
 */
import type { IEngineConfiguration } from 'eligius';
import { lintConfiguration } from 'eligius/lint';
import { type EligianMap, locateConfigPath } from './eligian-map.js';
import type { HostModule } from './operations/host-operations.js';
import type { SourceLocation } from './types/common.js';

/** Lint rules Eligian checks on the source already. */
export const LINT_RULES_CHECKED_BY_ELIGIAN: readonly string[] = ['W111'];

export interface EligiusLintFinding {
  readonly severity: 'error' | 'warning';
  /** The Eligius rule, e.g. `E120` */
  readonly rule: string;
  readonly message: string;
  /** The JSON path in the compiled configuration (empty for the whole configuration) */
  readonly path: string;
  /** Where in the source; without `file` it is in the compiled program */
  readonly location?: SourceLocation;
}

/** The Eligius lint findings of a compiled configuration, at their source. */
export function lintCompiledConfig(
  config: IEngineConfiguration,
  map: EligianMap,
  host?: HostModule
): EligiusLintFinding[] {
  return lintConfiguration(config, {
    customOperations: host?.operations ?? [],
    customControllers: host?.controllers ?? [],
    customFunctions: host?.functions ?? [],
  })
    .filter(finding => !LINT_RULES_CHECKED_BY_ELIGIAN.includes(finding.code))
    .map(finding => ({
      severity: finding.severity,
      rule: finding.code,
      message: finding.message,
      path: finding.path,
      location: locateConfigPath(map, config, finding.path),
    }));
}
