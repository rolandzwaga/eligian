/**
 * How `eligian smoke` words and locates an engine error (spec 058 phase 4, FR-017 / FR-040; plan
 * B1), shared with `eligian dev` so a runtime report reads the same in both.
 *
 * Import constraint: `node:path` and type-only imports, no jsdom and no dom-environment.ts.
 */
import * as nodePath from 'node:path';
import type {
  EligianMap,
  EngineErrorCandidate,
  LocatedEngineError,
  SourceLocation,
} from '@eligian/language';
import type { IEngineConfiguration } from 'eligius';

/** Eligius' warning when a `selectElement` selector matches nothing; group 1 is the selector. */
export const SELECTOR_MISS = /^selector '(.+)' wasn't found!$/;

/** The message of a `smoke-engine-error`: the failing operation, then the other candidates. */
export function engineErrorText(
  error: { message: string; cause?: unknown; phase?: string; operationSystemName?: string },
  located: LocatedEngineError | undefined,
  map: EligianMap
): string {
  return (
    errorMessage(error, located?.operation?.systemName, located?.via) +
    alsoAt(located?.alternatives ?? [], map)
  );
}

export function errorMessage(
  error: { message: string; cause?: unknown; phase?: string; operationSystemName?: string },
  operation: string | undefined,
  via: readonly string[] | undefined
): string {
  const cause = error.cause instanceof Error ? error.cause.message : String(error.cause ?? '');
  const op = operation ?? error.operationSystemName;
  const where = `${error.phase ?? 'start'} operation${op ? ` ${op}` : ''}`;
  const path = via && via.length > 0 ? ` (in ${via.join(' → ')})` : '';
  return `${where}${path}: ${cause || error.message}`;
}

/**
 * The other operations that match the report: Eligius names only the
 * innermost operation (name and index), which can repeat in the call chain.
 */
export function alsoAt(alternatives: readonly EngineErrorCandidate[], map: EligianMap): string {
  const places = alternatives.flatMap(alternative => {
    const at = inFile(alternative.operation.location, map);
    if (!at) return [];
    const path = alternative.via.length > 0 ? ` (in ${alternative.via.join(' → ')})` : '';
    return [`${nodePath.basename(at.file)}:${at.line}:${at.column}${path}`];
  });
  return places.length > 0 ? ` [or at ${places.join(', ')}]` : '';
}

/** A location with its file (the compiled file when the map does not name one). */
export function inFile(
  location: SourceLocation | undefined,
  map: EligianMap
): (SourceLocation & { file: string }) | undefined {
  if (!location) return undefined;
  const file = location.file ?? map.source;
  return file ? { ...location, file } : undefined;
}

/** The source of the first `selectElement` with this literal selector. */
export function selectorLocation(
  config: IEngineConfiguration,
  map: EligianMap,
  selector: string
): SourceLocation | undefined {
  type Ops = readonly { systemName: string; operationData?: Record<string, unknown> }[];
  const actions: { id: string; startOperations: Ops; endOperations?: Ops }[] = [
    ...(config.actions as never[]),
    ...(config.initActions as never[]),
    ...config.timelines.flatMap(t => t.timelineActions as never[]),
  ];
  for (const action of actions) {
    for (const phase of ['start', 'end'] as const) {
      const ops = phase === 'start' ? action.startOperations : (action.endOperations ?? []);
      const index = ops.findIndex(
        op => op.systemName === 'selectElement' && op.operationData?.selector === selector
      );
      if (index >= 0) return map.actions[action.id]?.[phase][index]?.location;
    }
  }
  return undefined;
}
