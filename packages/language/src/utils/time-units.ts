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
