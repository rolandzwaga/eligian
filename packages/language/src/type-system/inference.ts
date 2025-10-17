/**
 * Type inference engine for Eligian DSL
 *
 * This module implements type inference logic:
 * - Infer types from literal expressions
 * - Track variable types in a type environment
 * - Collect type constraints from operation usage
 * - Unify constraints to determine parameter types
 */

import { OPERATION_REGISTRY } from '../compiler/operations/index.js';
import type {
  ActionDefinition,
  EndableActionDefinition,
  Expression,
  OperationCall,
  OperationStatement,
  RegularActionDefinition,
} from '../generated/ast.js';
import {
  isArrayLiteral,
  isBooleanLiteral,
  isNumberLiteral,
  isObjectLiteral,
  isOperationCall,
  isParameterReference,
  isStringLiteral,
} from '../generated/ast.js';
import type { EligianType, TypeConstraint, TypeError } from './types.js';

/**
 * Type environment for tracking variable and parameter types
 */
export class TypeEnvironment {
  private types: Map<string, EligianType> = new Map();

  /**
   * Add a variable or parameter type to the environment
   */
  addVariable(name: string, type: EligianType): void {
    this.types.set(name, type);
  }

  /**
   * Get the type of a variable or parameter
   */
  getVariableType(name: string): EligianType | undefined {
    return this.types.get(name);
  }

  /**
   * Check if a variable or parameter exists in the environment
   */
  hasVariable(name: string): boolean {
    return this.types.has(name);
  }

  /**
   * Clone the environment (for branching contexts like if/else)
   */
  clone(): TypeEnvironment {
    const cloned = new TypeEnvironment();
    cloned.types = new Map(this.types);
    return cloned;
  }
}

/**
 * Infer the type of a literal expression (T296)
 *
 * This function analyzes expression AST nodes and returns their corresponding
 * Eligian type. It handles all primitive literal types.
 *
 * @param expr - Expression AST node to analyze
 * @returns The inferred EligianType
 *
 * @example
 * inferLiteralType(stringLiteral) // → 'string'
 * inferLiteralType(numberLiteral) // → 'number'
 * inferLiteralType(booleanLiteral) // → 'boolean'
 * inferLiteralType(objectLiteral) // → 'object'
 * inferLiteralType(arrayLiteral) // → 'array'
 */
export function inferLiteralType(expr: Expression): EligianType {
  // String literals: "hello", 'world', "#selector"
  if (isStringLiteral(expr)) {
    return 'string';
  }

  // Number literals: 42, 3.14, 1000
  if (isNumberLiteral(expr)) {
    return 'number';
  }

  // Boolean literals: true, false
  if (isBooleanLiteral(expr)) {
    return 'boolean';
  }

  // Object literals: { key: value, ... }
  if (isObjectLiteral(expr)) {
    return 'object';
  }

  // Array literals: [1, 2, 3], ["a", "b"]
  if (isArrayLiteral(expr)) {
    return 'array';
  }

  // For all other expression types (references, binary expressions, etc.),
  // return 'unknown' - they require more sophisticated analysis
  return 'unknown';
}

/**
 * Collect type constraints for parameters from operation usage (T308)
 *
 * This function walks through all operation calls in an action and collects
 * type constraints for each parameter based on how it's used.
 *
 * @param action - ActionDefinition (regular or endable)
 * @returns Map of parameter name → array of type constraints
 *
 * @example
 * // Given:
 * action fadeIn(selector, duration) [
 *   selectElement(selector)      // selector must be string
 *   animate({opacity: 1}, duration)  // duration must be number
 * ]
 *
 * collectParameterConstraints(fadeIn)
 * // → Map {
 * //     'selector' => [{ parameterName: 'selector', expectedType: 'string', ... }],
 * //     'duration' => [{ parameterName: 'duration', expectedType: 'number', ... }]
 * //   }
 */
export function collectParameterConstraints(
  action: ActionDefinition
): Map<string, TypeConstraint[]> {
  const constraints = new Map<string, TypeConstraint[]>();

  // Get all operations from the action
  const operations: OperationStatement[] = [];
  if (action.$type === 'RegularActionDefinition') {
    operations.push(...(action as RegularActionDefinition).operations);
  } else if (action.$type === 'EndableActionDefinition') {
    operations.push(...(action as EndableActionDefinition).startOperations);
    operations.push(...(action as EndableActionDefinition).endOperations);
  }

  // Walk through each operation and collect constraints
  for (const statement of operations) {
    collectConstraintsFromStatement(statement, constraints);
  }

  return constraints;
}

/**
 * Helper: Recursively collect constraints from an operation statement
 * Handles operation calls, if/else, and for loops
 */
function collectConstraintsFromStatement(
  statement: OperationStatement,
  constraints: Map<string, TypeConstraint[]>
): void {
  if (isOperationCall(statement)) {
    collectConstraintsFromOperationCall(statement, constraints);
  } else if (statement.$type === 'IfStatement') {
    // Recurse into if/else branches
    for (const op of statement.thenOps) {
      collectConstraintsFromStatement(op, constraints);
    }
    for (const op of statement.elseOps ?? []) {
      collectConstraintsFromStatement(op, constraints);
    }
  } else if (statement.$type === 'ForStatement') {
    // Recurse into for loop body
    for (const op of statement.body) {
      collectConstraintsFromStatement(op, constraints);
    }
  }
  // VariableDeclaration doesn't contribute parameter constraints
}

/**
 * Helper: Collect constraints from a single operation call
 */
function collectConstraintsFromOperationCall(
  call: OperationCall,
  constraints: Map<string, TypeConstraint[]>
): void {
  const opName = call.operationName;

  // Get expected parameter types from operation registry
  const expectedTypes = getOperationParameterTypes(opName);
  if (expectedTypes.size === 0) {
    return; // No type information available
  }

  // Check each argument to see if it's a parameter reference
  const operation = OPERATION_REGISTRY[opName];
  for (let i = 0; i < call.args.length && i < operation.parameters.length; i++) {
    const arg = call.args[i];
    const param = operation.parameters[i];
    const expectedType = expectedTypes.get(param.name);

    if (!expectedType) {
      continue; // No type info for this parameter
    }

    // Check if this argument is a parameter reference
    if (isParameterReference(arg)) {
      const paramName = arg.parameter.ref?.name ?? '';
      if (!paramName) {
        continue; // Unresolved reference
      }

      // Add constraint for this parameter
      const constraint: TypeConstraint = {
        parameter: paramName,
        expectedType: expectedType,
        source: `${opName}(arg ${i + 1}: ${param.name})`,
        location: {
          line: 0, // TODO: get actual location from AST node
          column: 0,
          length: 0,
        },
      };

      // Add to constraints map
      const existing = constraints.get(paramName) ?? [];
      existing.push(constraint);
      constraints.set(paramName, existing);
    }
  }
}

/**
 * Unify type constraints to determine a single type (T309)
 *
 * Takes a list of type constraints for a parameter and attempts to unify them
 * into a single type. If all constraints expect the same type, that type is returned.
 * If constraints conflict, a TypeError is returned.
 *
 * @param constraints - Array of type constraints for a single parameter
 * @returns The unified type or a TypeError if constraints conflict
 *
 * @example
 * unifyConstraints([
 *   { expectedType: 'string', source: 'selectElement', ... },
 *   { expectedType: 'string', source: 'addClass', ... }
 * ])
 * // → 'string'
 *
 * unifyConstraints([
 *   { expectedType: 'string', source: 'selectElement', ... },
 *   { expectedType: 'number', source: 'animate', ... }
 * ])
 * // → TypeError (conflicting types)
 */
export function unifyConstraints(constraints: TypeConstraint[]): EligianType | TypeError {
  // Empty constraints → unknown type
  if (constraints.length === 0) {
    return 'unknown';
  }

  // Single constraint → use that type
  if (constraints.length === 1) {
    return constraints[0].expectedType;
  }

  // Multiple constraints → check if they all match
  const firstType = constraints[0].expectedType;
  const allSame = constraints.every(c => c.expectedType === firstType);

  if (allSame) {
    return firstType;
  }

  // Conflicting types → error
  const types = constraints.map(c => c.expectedType);
  const sources = constraints.map(c => c.source);

  return {
    code: 'TYPE_CONFLICT',
    message: `Parameter has conflicting type requirements: ${types.join(' vs ')}`,
    hint: `Used as different types in: ${sources.join(', ')}`,
    location: constraints[0].location,
  };
}

/**
 * Infer parameter types for an action (T310)
 *
 * Combines constraint collection (T308) and unification (T309) to infer
 * types for all parameters in an action based on their usage.
 *
 * @param action - ActionDefinition (regular or endable)
 * @returns Map of parameter name → inferred type, or array of TypeErrors if conflicts exist
 *
 * @example
 * // Given:
 * action fadeIn(selector, duration) [
 *   selectElement(selector)           // selector used as string
 *   animate({opacity: 1}, duration)   // duration used as number
 * ]
 *
 * inferParameterTypes(fadeIn)
 * // → Map { 'selector' => 'string', 'duration' => 'number' }
 *
 * // Given conflicting usage:
 * action bad(value) [
 *   selectElement(value)    // value used as string
 *   animate({}, value)      // value used as number - CONFLICT!
 * ]
 *
 * inferParameterTypes(bad)
 * // → [TypeError { message: 'Parameter has conflicting type requirements...' }]
 */
export function inferParameterTypes(
  action: ActionDefinition
): Map<string, EligianType> | TypeError[] {
  // Step 1: Collect constraints from all operation usages
  const constraints = collectParameterConstraints(action);

  // Step 2: Unify constraints for each parameter
  const inferredTypes = new Map<string, EligianType>();
  const errors: TypeError[] = [];

  for (const [paramName, paramConstraints] of constraints.entries()) {
    const result = unifyConstraints(paramConstraints);

    if (typeof result === 'string') {
      // Successful unification → inferred type
      inferredTypes.set(paramName, result);
    } else {
      // Conflict → collect error
      errors.push(result);
    }
  }

  // Step 3: Return results
  if (errors.length > 0) {
    return errors; // Return errors if any conflicts
  }

  return inferredTypes; // Return inferred types if successful
}

/**
 * Cache for operation parameter types (T315 - Performance Optimization)
 *
 * This cache stores computed type maps for operations to avoid redundant
 * conversions. Since OPERATION_REGISTRY is static, we can safely cache results.
 */
const operationTypeCache = new Map<string, Map<string, EligianType>>();

/**
 * Get parameter types from operation registry (T299 + T315)
 *
 * This function queries the operation registry for parameter type information
 * and converts the rich ParameterType values to simple EligianType values.
 *
 * **Performance (T315)**: Results are cached per operation name to avoid
 * redundant type conversions. Cache lookup is O(1), providing <1ms overhead.
 *
 * @param operationName - Name of the operation to look up
 * @returns Map of parameter name → EligianType
 *
 * @example
 * getOperationParameterTypes('selectElement')
 * // → Map { 'selector' => 'string' }
 *
 * getOperationParameterTypes('animate')
 * // → Map { 'animationProperties' => 'object', 'animationDuration' => 'number', ... }
 */
export function getOperationParameterTypes(operationName: string): Map<string, EligianType> {
  // Check cache first (T315)
  const cached = operationTypeCache.get(operationName);
  if (cached) {
    return cached;
  }

  const operation = OPERATION_REGISTRY[operationName];
  if (!operation) {
    return new Map(); // Unknown operation - return empty map (don't cache)
  }

  const typeMap = new Map<string, EligianType>();

  // Convert each parameter's ParameterType to EligianType
  for (const param of operation.parameters) {
    // Handle both single ParameterType and ParameterType[] (multi-type)
    if (Array.isArray(param.type) && param.type.length > 0) {
      const firstType = param.type[0];

      // Check if it's a ConstantValue[] (enum-like)
      if (typeof firstType === 'object' && 'value' in firstType) {
        // Constant values are always strings in Eligius
        typeMap.set(param.name, 'string');
      } else {
        // It's a ParameterType[] - use the first type
        const eligianType = mapParameterTypeToEligianType(firstType as string);
        typeMap.set(param.name, eligianType);
      }
    }
  }

  // Cache result (T315)
  operationTypeCache.set(operationName, typeMap);

  return typeMap;
}

/**
 * Map operation registry ParameterType to EligianType
 *
 * Converts rich semantic types from the operation registry to our simpler
 * type system types used for compile-time checking.
 *
 * @param paramType - ParameterType from operation registry
 * @returns Corresponding EligianType
 */
export function mapParameterTypeToEligianType(paramType: string): EligianType {
  // Map rich ParameterType values to simple EligianType
  if (
    paramType.includes(':string') ||
    paramType.includes(':selector') ||
    paramType.includes(':className') ||
    paramType.includes(':htmlElementName') ||
    paramType.includes(':eventTopic') ||
    paramType.includes(':eventName') ||
    paramType.includes(':systemName') ||
    paramType.includes(':actionName') ||
    paramType.includes(':controllerName') ||
    paramType.includes(':url') ||
    paramType.includes(':htmlContent') ||
    paramType.includes(':labelId') ||
    paramType.includes(':ImagePath') ||
    paramType.includes(':QuadrantPosition') ||
    paramType.includes(':expression') ||
    paramType.includes(':mathfunction')
  ) {
    return 'string';
  }

  if (
    paramType.includes(':number') ||
    paramType.includes(':dimensions') ||
    paramType.includes(':dimensionsModifier')
  ) {
    return 'number';
  }

  if (paramType.includes(':boolean')) {
    return 'boolean';
  }

  if (paramType.includes(':object') || paramType.includes(':jQuery')) {
    return 'object';
  }

  if (paramType.includes(':array')) {
    return 'array';
  }

  // Default to unknown for unrecognized types
  return 'unknown';
}
