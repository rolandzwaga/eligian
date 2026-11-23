/**
 * Runtime reports of `eligian dev` (FR-014, FR-018, FR-037, FR-038): the
 * shapes the dev client posts to `/__eligian/runtime`, the `dev-errors.json`
 * file the server keeps in `<entry dir>/.eligian/`, and its pure merge / cap
 * rules. Plain async TypeScript; the only rejections are the fs ones, which
 * the caller logs.
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { writeFileAtomic } from '../atomic-write.js';

export type DevErrorKind =
  | 'engine-error'
  | 'console-error'
  | 'console-warn'
  | 'selector-miss'
  | 'window-error'
  | 'unhandled-rejection'
  | 'build-error';

export interface EngineErrorReport {
  readonly kind: 'engine-error';
  readonly buildId: string;
  readonly message: string;
  readonly actionId: string;
  readonly actionName?: string;
  readonly phase: 'start' | 'end';
  readonly operationSystemName?: string;
  readonly operationIndex?: number;
  readonly operationPath?: readonly { readonly systemName: string; readonly index: number }[];
  readonly timelineUri?: string;
  readonly position?: number;
}

export interface PageErrorReport {
  readonly kind: 'console-error' | 'console-warn' | 'window-error' | 'unhandled-rejection';
  readonly buildId: string;
  readonly message: string;
  readonly source?: string;
  readonly line?: number;
  readonly column?: number;
}

export interface SelectorMissReport {
  readonly kind: 'selector-miss';
  readonly buildId: string;
  readonly message: string;
  readonly selector: string;
}

export type RuntimeReport = EngineErrorReport | PageErrorReport | SelectorMissReport;

export interface DevError {
  readonly kind: DevErrorKind;
  readonly message: string;
  readonly count: number;
  readonly first: string;
  readonly last: string;
  readonly file?: string;
  readonly line?: number;
  readonly column?: number;
  readonly endLine?: number;
  readonly endColumn?: number;
  readonly timeline?: string;
  readonly position?: number;
  readonly action?: string;
  readonly operation?: string;
  readonly via?: readonly string[];
  readonly exact?: boolean;
  readonly alternatives?: readonly {
    file: string;
    line: number;
    column: number;
    via: readonly string[];
  }[];
}

export interface DevErrorsFile {
  readonly version: 1;
  readonly entry: string;
  readonly url: string;
  readonly buildId: string;
  readonly updated: string;
  readonly errors: readonly DevError[];
}

/** At most this many entries in `dev-errors.json`; the oldest go first (FR-018) */
export const MAX_ENTRIES = 100;
/** Larger report bodies get `400` (FR-014) */
export const MAX_BODY_BYTES = 64 * 1024;
/** Report strings are cut to this length */
const MAX_STRING = 4000;

const PAGE_KINDS: ReadonlySet<string> = new Set([
  'console-error',
  'console-warn',
  'window-error',
  'unhandled-rejection',
]);

/** Marks an invalid field; distinct from `undefined` (an absent optional field) */
const INVALID = Symbol('invalid');

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const str = (value: unknown): string | typeof INVALID =>
  typeof value === 'string' ? value.slice(0, MAX_STRING) : INVALID;

const optStr = (value: unknown): string | undefined | typeof INVALID =>
  value === undefined ? undefined : str(value);

const optNum = (value: unknown): number | undefined | typeof INVALID =>
  value === undefined ? undefined : Number.isFinite(value) ? (value as number) : INVALID;

const optPath = (
  value: unknown
): { systemName: string; index: number }[] | undefined | typeof INVALID => {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return INVALID;
  const steps: { systemName: string; index: number }[] = [];
  for (const step of value) {
    if (!isRecord(step)) return INVALID;
    const systemName = str(step.systemName);
    const index = optNum(step.index);
    if (systemName === INVALID || index === INVALID || index === undefined) return INVALID;
    steps.push({ systemName, index });
  }
  return steps;
};

/** The defined fields only, or `undefined` when one of them is invalid */
const build = <T>(fields: Record<string, unknown>): T | undefined => {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === INVALID) return undefined;
    if (value !== undefined) out[key] = value;
  }
  return out as T;
};

/**
 * Shape check of a posted report (FR-014): known keys only, strings over
 * 4,000 chars truncated. `undefined` (the route answers `400`) for anything
 * else, a missing `buildId` included.
 */
export function parseRuntimeReport(body: unknown): RuntimeReport | undefined {
  if (!isRecord(body)) return undefined;
  const kind = body.kind;
  if (typeof kind !== 'string') return undefined;
  if (typeof body.buildId !== 'string' || body.buildId === '') return undefined;
  const common = { kind, buildId: str(body.buildId), message: str(body.message) };
  if (kind === 'engine-error') {
    if (body.phase !== 'start' && body.phase !== 'end') return undefined;
    return build<EngineErrorReport>({
      ...common,
      actionId: str(body.actionId),
      actionName: optStr(body.actionName),
      phase: body.phase,
      operationSystemName: optStr(body.operationSystemName),
      operationIndex: optNum(body.operationIndex),
      operationPath: optPath(body.operationPath),
      timelineUri: optStr(body.timelineUri),
      position: optNum(body.position),
    });
  }
  if (kind === 'selector-miss') {
    return build<SelectorMissReport>({ ...common, selector: str(body.selector) });
  }
  if (PAGE_KINDS.has(kind)) {
    return build<PageErrorReport>({
      ...common,
      source: optStr(body.source),
      line: optNum(body.line),
      column: optNum(body.column),
    });
  }
  return undefined;
}

/** The FR-018 merge key: kind, message, file:line:column. */
export function mergeKey(
  error: Pick<DevError, 'kind' | 'message' | 'file' | 'line' | 'column'>
): string {
  return JSON.stringify([
    error.kind,
    error.message,
    `${error.file ?? ''}:${error.line ?? ''}:${error.column ?? ''}`,
  ]);
}

/**
 * Merge `error` into the entry with its key (count + 1, `last` = now) or
 * append it; drop the oldest beyond MAX_ENTRIES. Returns a new file.
 */
export function addError(
  file: DevErrorsFile,
  error: Omit<DevError, 'count' | 'first' | 'last'>,
  now: string
): DevErrorsFile {
  const key = mergeKey(error);
  const index = file.errors.findIndex(existing => mergeKey(existing) === key);
  let errors: DevError[];
  if (index >= 0) {
    errors = [...file.errors];
    errors[index] = { ...errors[index], count: errors[index].count + 1, last: now };
  } else {
    errors = [...file.errors, { ...error, count: 1, first: now, last: now }];
    if (errors.length > MAX_ENTRIES) errors = errors.slice(errors.length - MAX_ENTRIES);
  }
  return { ...file, updated: now, errors };
}

/**
 * Atomic write of `<dir>/dev-errors.json` through `writeFileAtomic`
 * (`../atomic-write.ts`): a `.dev-errors.<pid>.<n>.tmp` temp file in the same
 * dir, then a rename onto the target, retried on EPERM / EBUSY / EACCES.
 */
export async function writeDevErrors(dir: string, file: DevErrorsFile): Promise<void> {
  await writeFileAtomic(path.join(dir, 'dev-errors.json'), `${JSON.stringify(file, null, 2)}\n`);
}

/**
 * FR-037: create `<root>/.eligian/` and, only when it was created now, its
 * self-ignoring `.gitignore` (`*`). An existing dir is left as it is; the
 * user's own `.gitignore` files are never touched. Returns the dir path.
 */
export async function ensureEligianDir(root: string): Promise<string> {
  const dir = path.join(root, '.eligian');
  try {
    await fs.mkdir(dir, { recursive: false });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return dir;
    throw error;
  }
  await fs.writeFile(path.join(dir, '.gitignore'), '*\n', 'utf8');
  return dir;
}
