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
}): string | undefined {
  if (options.bundle && options.check) {
    return '--bundle and --check cannot be combined: --check validates only and writes no output, but --bundle always writes a bundle directory';
  }
  return undefined;
}
