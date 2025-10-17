/**
 * Type system exports for Eligian DSL
 *
 * This module re-exports all public APIs from the type system.
 */

// Inference
export {
  collectParameterConstraints,
  getOperationParameterTypes,
  inferLiteralType,
  inferParameterTypes,
  TypeEnvironment,
  unifyConstraints,
} from './inference.js';
// Types
export type {
  EligianType,
  SourceLocation,
  TypeAnnotation,
  TypeConstraint,
  TypeError,
} from './types.js';

// Validation
export { validateTypeCompatibility } from './validator.js';
