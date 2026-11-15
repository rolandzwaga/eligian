/**
 * Spec 058 Phase 5 (FR-022, FR-024; plan D1b): the tool mix and heap helper shared by
 * `scripts/measure-recycle.ts`, `scripts/measure-heap.ts` and the soak.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NAME as CHECK, type Parameters as CheckParameters } from '../mcp/tools/check.js';
import { NAME as COMPILE, type Parameters as CompileParameters } from '../mcp/tools/compile.js';
import { NAME as FMT, type Parameters as FmtParameters } from '../mcp/tools/fmt.js';
import {
  NAME as OPERATIONS,
  type Parameters as OperationsParameters,
} from '../mcp/tools/operations.js';
import { NAME as PROJECT, type Parameters as ProjectParameters } from '../mcp/tools/project.js';

export interface MixCall {
  readonly name: string;
  readonly args: Readonly<Record<string, unknown>>;
}

/** FR-022's M, for one entry file (relative to the server cwd). */
export function toolMix(entry: string): readonly MixCall[] {
  return [
    { name: CHECK, args: { paths: [entry] } satisfies typeof CheckParameters.Type },
    { name: PROJECT, args: { path: entry } satisfies typeof ProjectParameters.Type },
    {
      name: COMPILE,
      args: { path: entry, view: 'summary' } satisfies typeof CompileParameters.Type,
    },
    { name: FMT, args: { paths: [entry], write: false } satisfies typeof FmtParameters.Type },
    {
      name: OPERATIONS,
      args: { path: entry, names: ['addClass'] } satisfies typeof OperationsParameters.Type,
    },
  ];
}

/** FR-022's rotation: call i (0-based) after r recycles uses M[(i + r) mod |M|]. */
export function mixCall(mix: readonly MixCall[], i: number, recycles: number): MixCall {
  return mix[(i + recycles) % mix.length];
}

/** Copies a project into a fresh temp dir (no dist/, no storyboards/), returning its path. */
export function copyProject(
  from: string,
  exclude: readonly string[] = ['dist', 'storyboards']
): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eligian-mix-'));
  const root = path.resolve(from);
  fs.cpSync(root, dir, {
    recursive: true,
    filter: source => {
      const top = path.relative(root, path.resolve(source)).split(path.sep)[0];
      return !exclude.includes(top);
    },
  });
  return dir;
}

/** A GC that frees less than this counts as settled. */
const SETTLED_BYTES = 1024 * 1024;
/** Upper bound on forced GCs per reading. */
const MAX_GCS = 10;

/**
 * `heapUsed` in bytes after forced GCs, once a GC frees less than 1 MB (at least three, at most
 * ten). Two were not enough under CPU load: the mixed soak read 30.37 MB growth after two GCs
 * and 7.8 MB after a third, called right after with no event-loop turn in between, so nothing
 * held that memory; the second GC's reading still counted it (V8's incremental marking and
 * concurrent sweeping lag behind on a loaded machine). Spec 058 phase 5, Group 7 gate. Moved here from `mcp-soak.spec.ts`; `measure-heap.ts` (MB) and
 * `measure-recycle.ts` call it too, dividing by MB themselves.
 */
export function heapAfterGc(gc: () => void): number {
  gc();
  gc();
  let used = process.memoryUsage().heapUsed;
  for (let gcs = 2; gcs < MAX_GCS; gcs++) {
    gc();
    const next = process.memoryUsage().heapUsed;
    if (used - next < SETTLED_BYTES) return next;
    used = next;
  }
  return used;
}
