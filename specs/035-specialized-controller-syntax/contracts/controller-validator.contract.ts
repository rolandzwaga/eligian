/**
 * Contract: Controller Validator API
 *
 * Defines the public interface for validating addController operation calls.
 * This validator checks controller name existence, parameter count, parameter types,
 * and delegates to specialized validators for parameter types like labelId.
 *
 * Feature: 035-specialized-controller-syntax
 * User Stories: US1 (P1), US2 (P2)
 */

import type { OperationCall } from '../../../packages/language/src/generated/ast.js';
import type { ValidationAcceptor } from 'langium';
import type { ControllerMetadata } from './metadata-generator.contract.js';

/**
 * Controller Validator Service
 *
 * Validates addController operation calls against controller metadata.
 */
export interface IControllerValidator {
  /**
   * Validate an addController operation call
   *
   * Checks:
   * 1. Controller name exists in CONTROLLERS array
   * 2. Parameter count matches controller metadata (required + optional)
   * 3. Parameter types match metadata expectations
   * 4. Special parameter types (labelId) validated via type-specific validators
   *
   * @param call - The operation call AST node
   * @param accept - Langium validation acceptor for reporting diagnostics
   *
   * @example
   * // Valid call
   * addController('LabelController', "mainTitle")
   * // → No errors
   *
   * // Unknown controller
   * addController('UnknownCtrl', "param")
   * // → Error: "Unknown controller: 'UnknownCtrl' (Did you mean: 'LabelController'?)"
   *
   * // Missing required parameter
   * addController('LabelController')
   * // → Error: "Missing required parameter 'labelId' for controller 'LabelController'"
   *
   * // Too many parameters
   * addController('LabelController', "id", "attr", "extra")
   * // → Error: "Too many parameters for controller 'LabelController' (expected 2, got 3)"
   */
  checkControllerAddition(call: OperationCall, accept: ValidationAcceptor): void;

  /**
   * Get controller metadata by name
   *
   * @param controllerName - The controller class name (e.g., "LabelController")
   * @returns Controller metadata if found, undefined otherwise
   *
   * @example
   * getControllerMetadata('LabelController')
   * // → { name: "LabelController", parameters: [...], ... }
   *
   * getControllerMetadata('UnknownController')
   * // → undefined
   */
  getControllerMetadata(controllerName: string): ControllerMetadata | undefined;

  /**
   * Suggest similar controller names for typos
   *
   * Uses Levenshtein distance (threshold ≤2) to find similar controller names.
   *
   * @param input - The misspelled controller name
   * @returns Array of suggested controller names (max 3), sorted by distance
   *
   * @example
   * suggestControllers('LablController')
   * // → ['LabelController']
   *
   * suggestControllers('NavCtrl')
   * // → ['NavigationController']
   *
   * suggestControllers('XYZ')
   * // → [] (no close matches)
   */
  suggestControllers(input: string): string[];
}

/**
 * Validation Error Codes
 *
 * Standardized error codes for controller validation failures.
 */
export enum ControllerValidationErrorCode {
  /** Controller name not found in CONTROLLERS array */
  UNKNOWN_CONTROLLER = 'unknown_controller',

  /** Required parameter missing from args */
  MISSING_REQUIRED_PARAMETER = 'missing_required_parameter',

  /** More arguments than controller accepts */
  TOO_MANY_PARAMETERS = 'too_many_parameters',

  /** Argument type incompatible with parameter type */
  PARAMETER_TYPE_MISMATCH = 'parameter_type_mismatch',

  /** Label ID parameter references non-existent label (Feature 034) */
  INVALID_LABEL_ID = 'invalid_label_id',
}

/**
 * Validation Error Details
 *
 * Structured error information for diagnostic reporting.
 */
export interface ControllerValidationError {
  /** Standardized error code */
  code: ControllerValidationErrorCode;

  /** Human-readable error message */
  message: string;

  /** Suggested fixes (controller names, label IDs, etc.) */
  suggestions?: string[];

  /** Expected value (for count/type mismatches) */
  expected?: string | number;

  /** Actual value (for count/type mismatches) */
  actual?: string | number;
}
