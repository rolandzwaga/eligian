/**
 * Operation Registry Type System
 *
 * This module defines the type system for the operation registry, which provides
 * validation and metadata for all Eligius operations. The types are designed to
 * work with Eligius metadata functions that provide rich parameter type information.
 *
 * Key features:
 * - 23 rich ParameterTypes (className, selector, actionName, etc.) from Eligius
 * - Constant value constraints for enum-like validation
 * - Explicit dependency and output tracking
 * - Support for required/optional parameters with defaults
 */

/**
 * Rich parameter types from Eligius metadata.
 * These go beyond basic types (string, number) to provide semantic validation.
 *
 * Examples:
 * - ParameterType:className - CSS class names (can validate against CSS file)
 * - ParameterType:selector - CSS selectors
 * - ParameterType:actionName - Action references (can validate action exists)
 * - ParameterType:eventTopic - Event topics (can validate topic exists)
 */
export type ParameterType =
  | 'ParameterType:htmlElementName'
  | 'ParameterType:className'
  | 'ParameterType:selector'
  | 'ParameterType:string'
  | 'ParameterType:number'
  | 'ParameterType:object'
  | 'ParameterType:boolean'
  | 'ParameterType:array'
  | 'ParameterType:eventTopic'
  | 'ParameterType:eventName'
  | 'ParameterType:systemName'
  | 'ParameterType:actionName'
  | 'ParameterType:controllerName'
  | 'ParameterType:dimensions'
  | 'ParameterType:dimensionsModifier'
  | 'ParameterType:url'
  | 'ParameterType:htmlContent'
  | 'ParameterType:labelId'
  | 'ParameterType:ImagePath'
  | 'ParameterType:QuadrantPosition'
  | 'ParameterType:jQuery'
  | 'ParameterType:expression'
  | 'ParameterType:mathfunction'
  | 'ParameterType:cssProperties';

/**
 * Represents a constant value constraint (enum-like).
 *
 * Example from setElementContent operation:
 * insertionType can be 'overwrite' | 'append' | 'prepend'
 *
 * This is represented as:
 * [
 *   { value: 'overwrite', isDefault: true },
 *   { value: 'append' },
 *   { value: 'prepend' }
 * ]
 */
export interface ConstantValue {
  /** The allowed constant value */
  value: string;
  /** Whether this is the default value if parameter is omitted */
  isDefault?: boolean;
  /** Optional description for this value */
  description?: string;
}

/**
 * Metadata for a single operation parameter.
 *
 * Supports three type modes:
 * 1. Single ParameterType: parameter accepts values of that semantic type (wrapped in array)
 * 2. Multiple ParameterTypes: parameter accepts any of the specified types (e.g., array|string)
 * 3. ConstantValue[]: parameter must be one of the specified constant values (enum)
 *
 * Note: ParameterType[] always uses an array for consistency, even for single types.
 * This simplifies validation logic - just check if argument matches any type in the array.
 *
 * @example
 * // Single type: { name: 'className', type: ['ParameterType:className'], required: true }
 * // Multi-type: { name: 'collection', type: ['ParameterType:array', 'ParameterType:string'], required: true }
 * // Constant values: { name: 'insertionType', type: [{ value: 'overwrite' }, { value: 'append' }], required: false }
 */
export interface OperationParameter {
  /** Parameter name (e.g., 'className', 'selector') */
  name: string;
  /** Parameter type - array of semantic types OR array of allowed constant values */
  type: ParameterType[] | ConstantValue[];
  /** Whether this parameter is required */
  required: boolean;
  /** Default value if parameter is optional and not provided */
  defaultValue?: unknown;
  /** Human-readable description of parameter purpose */
  description?: string;
  /** Whether this parameter is erased from operation scope after execution (Eligius 1.2.1+) */
  erased?: boolean;
}

/**
 * Metadata for an operation dependency.
 *
 * Dependencies are values that must be available from previous operations
 * before this operation can execute.
 *
 * Example: addClass depends on 'selectedElement' from a previous selectElement call
 */
export interface DependencyInfo {
  /** Dependency name (e.g., 'selectedElement', 'template') */
  name: string;
  /** Expected type of the dependency value */
  type: ParameterType;
}

/**
 * Metadata for an operation output.
 *
 * Outputs are values produced by this operation that can be used as
 * dependencies for subsequent operations.
 *
 * Example: selectElement outputs 'selectedElement' for use by addClass, etc.
 *
 * Note: Like parameters, outputs can have multiple possible types (array for consistency).
 */
export interface OutputInfo {
  /** Output name (e.g., 'selectedElement') */
  name: string;
  /** Type of the output value - array for consistency with parameters */
  type: ParameterType[] | ParameterType;
  /** Whether this output is erased from operation scope after execution (Eligius 1.2.1+) */
  erased?: boolean;
}

/**
 * Complete signature metadata for a single operation.
 *
 * This is the core data structure for operation validation and IDE support.
 * It combines information from:
 * - Eligius metadata functions (description, dependencies, parameters, outputs)
 * - Operation category classification
 */
export interface OperationSignature {
  /** System name of the operation (e.g., 'addClass', 'selectElement') */
  systemName: string;
  /** Human-readable description of what the operation does */
  description: string;
  /** List of input parameters */
  parameters: OperationParameter[];
  /** List of dependencies from previous operations */
  dependencies: DependencyInfo[];
  /** List of outputs produced by this operation */
  outputs: OutputInfo[];
  /** Optional category for grouping (e.g., 'DOM', 'Animation', 'Control Flow') */
  category?: string;
}

/**
 * Registry of all available operations.
 * Maps operation name → operation signature.
 *
 * This will be generated from Eligius metadata at build time.
 *
 * Example:
 * {
 *   'addClass': { systemName: 'addClass', description: '...', ... },
 *   'selectElement': { systemName: 'selectElement', description: '...', ... },
 *   ...
 * }
 */
export type OperationRegistry = Record<string, OperationSignature>;

/**
 * Type guard to check if a parameter type is ParameterType[] (vs ConstantValue[])
 */
export function isParameterTypeArray(
  type: ParameterType[] | ConstantValue[]
): type is ParameterType[] {
  return Array.isArray(type) && (type.length === 0 || typeof type[0] === 'string');
}

/**
 * Type guard to check if a parameter type is an array of constant values
 */
export function isConstantValueArray(
  type: ParameterType[] | ConstantValue[]
): type is ConstantValue[] {
  return Array.isArray(type) && type.length > 0 && typeof type[0] === 'object';
}

/**
 * Helper to get default constant value from an array of constant values
 */
export function getDefaultConstantValue(constants: ConstantValue[]): string | undefined {
  const defaultValue = constants.find(c => c.isDefault);
  return defaultValue?.value ?? constants[0]?.value;
}
