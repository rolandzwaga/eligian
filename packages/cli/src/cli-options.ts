/**
 * CLI option validation helpers (pure, no process side effects).
 */

/**
 * Parse the `--inline-threshold` value.
 *
 * Only a plain non-negative integer number of bytes is accepted. `parseInt`
 * would silently turn `8k` into 8 and `-5` into a negative threshold that
 * disables inlining, so anything else is rejected.
 *
 * @returns the threshold in bytes, or undefined when the value is invalid
 */
export function parseInlineThreshold(value: string): number | undefined {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    return undefined;
  }
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

/**
 * Validate flag combinations that cannot be honoured together.
 *
 * @returns an error message, or undefined when the combination is valid
 */
export function validateOptionCombination(options: {
  bundle: boolean;
  check: boolean;
  eligianMap?: boolean;
  output?: string;
}): string | undefined {
  if (options.bundle && options.check) {
    return '--bundle and --check cannot be combined: --check validates only and writes no output, but --bundle always writes a bundle directory';
  }
  if (options.eligianMap && options.bundle) {
    return '--eligian-map applies to JSON output, not to --bundle';
  }
  if (options.eligianMap && options.output === '-') {
    return "--eligian-map needs an output file (it is written next to it), not '-o -'";
  }
  return undefined;
}

/**
 * Idea #14: where `--eligian-map` writes the map for the output `story.json`:
 * `story.eligian-map.json` (a non-.json output gets the suffix appended).
 */
export function eligianMapPath(outputPath: string): string {
  return `${outputPath.replace(/.json$/i, '')}.eligian-map.json`;
}
