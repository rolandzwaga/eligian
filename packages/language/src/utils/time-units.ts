/**
 * Time unit conversion — single source of truth.
 *
 * Used by the compiler (time-transformer) to emit Eligius durations and by the
 * Typir timeline validation/inference (type-system-typir/utils/time-expression)
 * so that the IDE and the compiler always agree on what a time literal means.
 *
 * @module utils/time-units
 */

/**
 * Convert a time value to seconds based on its unit.
 *
 * Supports the grammar's `TimeUnit`: ms (milliseconds), s (seconds),
 * m (minutes), h (hours). A missing unit means seconds.
 */
export function convertTimeToSeconds(value: number, unit?: string): number {
  switch (unit) {
    case 'ms':
      return value / 1000;
    case 'm':
      return value * 60;
    case 'h':
      return value * 3600;
    default:
      return value; // 's' or no unit
  }
}

/**
 * Reported (by the IDE validator and the compiler) for a relative time in the
 * duration of `at <start> for <duration>`: a duration is a length, so `+2s`
 * has no meaning there.
 */
export const RELATIVE_DURATION_MESSAGE =
  "A duration cannot be a relative time: write 'for 2s', not 'for +2s'";

/** Reported for a `using scroll` timeline without a `duration` header option. */
export const SCROLL_DURATION_REQUIRED_MESSAGE =
  'A scroll timeline needs a duration: the scroll range maps onto it (e.g. \'using scroll "#scroller" duration 120s\')';
