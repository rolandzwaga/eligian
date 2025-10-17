/**
 * Type validation logic for Eligian DSL
 *
 * This module implements type compatibility checking:
 * - Validate type compatibility between actual and expected types
 * - Generate clear, actionable type errors
 */

import type { EligianType, SourceLocation, TypeError } from './types.js';

/**
 * Validate that an actual type is compatible with an expected type
 *
 * @param actual - The actual type
 * @param expected - The expected type
 * @param location - Source location for error reporting
 * @returns TypeError if incompatible, undefined if valid
 */
export function validateTypeCompatibility(
  actual: EligianType,
  expected: EligianType,
  location: SourceLocation
): TypeError | undefined {
  // Unknown type is compatible with everything (opt-out)
  if (actual === 'unknown' || expected === 'unknown') {
    return undefined;
  }

  // Same type is always compatible
  if (actual === expected) {
    return undefined;
  }

  // Different types are incompatible
  return {
    code: 'TYPE_MISMATCH',
    message: `Cannot use '${actual}' where '${expected}' is expected`,
    hint: `Expected type '${expected}', but got '${actual}'`,
    location,
  };
}
