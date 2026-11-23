/**
 * Spec 059 (P16; Phase 2 P3): the facts of one `eligian_brief` call, `exists` and `inside` over
 * the brief's directory. Moved from `tools/brief.ts`, which re-exports `makeFacts`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { isInside } from '../paths.js';
import type { Facts } from './engine.js';

/** A memoized predicate: the first answer per key is kept for this call only (FR-012). */
const memoize = (test: (key: string) => boolean): ((key: string) => boolean) => {
  const seen = new Map<string, boolean>();
  return key => {
    const known = seen.get(key);
    if (known !== undefined) return known;
    let result: boolean;
    try {
      result = test(key);
    } catch {
      result = false;
    }
    seen.set(key, result);
    return result;
  };
};

/**
 * The facts of one call (P16): `exists` and `inside` over the brief's directory, synchronous,
 * memoized for this call only; any error is `false`, so evaluation never throws.
 */
export const makeFacts = (root: string, briefDir: string): Facts => {
  const relative = path.relative(root, briefDir).split(path.sep).join('/');
  return {
    briefDir: relative === '' ? '.' : relative,
    exists: memoize(
      p => fs.statSync(path.resolve(briefDir, p), { throwIfNoEntry: false })?.isFile() === true
    ),
    inside: memoize(p => isInside(root, path.resolve(briefDir, p))),
  };
};
