/**
 * Atomic file writes (spec 059 FR-034, plan P6): a temp file in the target's directory, then a
 * rename onto the target, retried on EPERM / EBUSY / EACCES. Shared by `eligian dev`'s
 * `dev-errors.json` and the brief tool's `BRIEF.md`. Uses the `node:fs/promises` namespace so
 * the dev-server spec can observe it with `vi.mock`.
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

/**
 * Windows refuses to replace a file that any process has open. dev-server.spec.ts's burst test
 * reads dev-errors.json every few milliseconds while writing; under load a rename then kept
 * failing with EPERM and 5 × 20 ms of retries lost a report (2026-11-15, measured: the target
 * was held, fresh temp files did not help). Backoff 10, 20, … 200 ms, 20 attempts (~2.5 s);
 * the dev server also keeps the report in memory, so a write that still fails is carried by
 * the next one.
 */
const RENAME_RETRIES = 20;
const renameDelayMs = (attempt: number): number => Math.min(200, 10 * (attempt + 1));
const RETRYABLE: ReadonlySet<string> = new Set(['EPERM', 'EBUSY', 'EACCES']);
let tempCounter = 0;

const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

export interface WriteFileAtomicOptions {
  /**
   * Called after the temp file is written, before the rename. `false` aborts the write: the
   * temp file is removed and the call resolves `'aborted'`. A rejection removes the temp file
   * and rejects with the same error.
   */
  readonly beforeRename?: () => Promise<boolean>;
}

/**
 * Writes `text` to `target` through `.<target name>.<pid>.<n>.tmp` in the same directory and a
 * rename. The temp file never outlives the call: it is removed on an abort, a rejected
 * `beforeRename` and a rename that still fails after the retries.
 */
export async function writeFileAtomic(
  target: string,
  text: string,
  options?: WriteFileAtomicOptions
): Promise<'written' | 'aborted'> {
  const temp = path.join(
    path.dirname(target),
    `.${path.parse(target).name}.${process.pid}.${tempCounter++}.tmp`
  );
  await fs.writeFile(temp, text, 'utf8');
  try {
    if (options?.beforeRename !== undefined && !(await options.beforeRename())) {
      await fs.rm(temp, { force: true });
      return 'aborted';
    }
    for (let attempt = 0; ; attempt++) {
      try {
        await fs.rename(temp, target);
        return 'written';
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (attempt >= RENAME_RETRIES || code === undefined || !RETRYABLE.has(code)) throw error;
        await delay(renameDelayMs(attempt));
      }
    }
  } catch (error) {
    await fs.rm(temp, { force: true }).catch(() => {});
    throw error;
  }
}
