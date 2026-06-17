/**
 * Expression transformation (Langium Expression → JsonValue).
 *
 * Extracted verbatim from `ast-transformer.ts` as part of the W2 decomposition
 * (CODE_ANALYSIS).
 */
import { Effect } from 'effect';
import type { TransformError } from '../../errors/index.js';
import type { Expression } from '../../generated/ast.js';
import type { JsonValue } from '../types/eligius-ir.js';
import { createEmptyScope, type ScopeContext } from './scope.js';
import { getSourceLocation } from './source-location.js';

/**
 * Transform Expression → JsonValue
 *
 * Handles all expression types:
 * - Literals: strings, numbers, booleans, null
 * - Object literals: { key: value, ... }
 * - Array literals: [value1, value2, ...]
 * - Property chain references: $scope.currentItem
 * - System property references: @@currentItem (T229-T232)
 * - Variable references: @varName (T233)
 * - Parameter references: paramName (T231)
 * - Binary expressions: 10 + 5
 */
export const transformExpression = (
  expr: Expression,
  scope: ScopeContext = createEmptyScope()
): Effect.Effect<JsonValue, TransformError> =>
  Effect.gen(function* () {
    switch (expr.$type) {
      case 'StringLiteral':
        return expr.value;

      case 'NumberLiteral':
        return expr.value;

      case 'BooleanLiteral':
        return expr.value;

      case 'NullLiteral':
        return null;

      case 'ObjectLiteral': {
        const obj: Record<string, JsonValue> = {};
        for (const prop of expr.properties) {
          const key = typeof prop.key === 'string' ? prop.key : prop.key;
          const value = yield* transformExpression(prop.value, scope);
          obj[key] = value;
        }
        return obj;
      }

      case 'ArrayLiteral': {
        const arr: JsonValue[] = [];
        for (const element of expr.elements) {
          const value = yield* transformExpression(element, scope);
          arr.push(value);
        }
        return arr;
      }

      case 'PropertyChainReference': {
        // Property chain reference: $scope.currentItem
        // For now, serialize to string format that Eligius understands
        const scope = expr.scope;
        const properties = expr.properties.join('.');
        return `${scope}.${properties}`;
      }

      case 'VariableReference': {
        // Variable reference: @varName (T233)
        // CONSTANT FOLDING: Check if this is a constant first
        if (!expr.variable?.ref) {
          return yield* Effect.fail({
            _tag: 'TransformError' as const,
            kind: 'InvalidExpression' as const,
            message: `Undefined variable reference (linking failed)`,
            location: getSourceLocation(expr),
          });
        }

        const varName = expr.variable.ref.name;

        // Check action-scoped constants first (more specific scope)
        if (scope.scopedConstants.has(varName)) {
          const constant = scope.scopedConstants.get(varName)!;
          return constant.value; // Inline action-scoped constant
        }

        // Check global constants
        if (scope.programConstants.has(varName)) {
          const constant = scope.programConstants.get(varName)!;
          return constant.value; // Inline global constant
        }

        // Otherwise, it's a runtime scope variable
        return `$scope.variables.${varName}`;
      }

      case 'SystemPropertyReference': {
        // System property reference: @@varName (T232)
        // Compiles to $scope.varName
        // Special case: @@loopVar → @@currentItem (aliased)
        let propertyName = expr.name;

        // If this matches the current loop variable name, alias to currentItem
        if (scope.loopVariableName && expr.name === scope.loopVariableName) {
          propertyName = 'currentItem';
        }

        return `$scope.${propertyName}`;
      }

      case 'ParameterReference': {
        // Parameter reference: bare identifier (T231)
        // Compiles to $operationdata.paramName OR $operationdata.eventArgs[n] (Feature 028 - T020)
        // Now uses cross-reference to Parameter
        if (!expr.parameter?.ref) {
          return yield* Effect.fail({
            _tag: 'TransformError' as const,
            kind: 'InvalidExpression' as const,
            message: `Undefined parameter reference (linking failed)`,
            location: getSourceLocation(expr),
          });
        }

        // Validation: parameter references only valid inside actions
        // (This is now enforced by ScopeProvider, but double-check here)
        if (!scope.inActionBody) {
          return yield* Effect.fail({
            _tag: 'TransformError' as const,
            kind: 'InvalidExpression' as const,
            message: `Parameter reference '${expr.parameter.ref.name}' is only valid inside action bodies`,
            location: getSourceLocation(expr),
          });
        }

        const paramName = expr.parameter.ref.name;

        // T020: Check if this is an event action parameter (use index instead of name)
        if (scope.eventActionParameters?.has(paramName)) {
          const index = scope.eventActionParameters.get(paramName)!;
          return `$operationData.eventArgs[${index}]`;
        }

        // Regular action parameter (use name)
        return `$operationdata.${paramName}`;
      }

      case 'BinaryExpression': {
        // Binary expression: 10 + 5
        // Evaluate at compile time if both sides are literals
        const left = yield* transformExpression(expr.left, scope);
        const right = yield* transformExpression(expr.right, scope);

        // If both are numbers, evaluate
        if (typeof left === 'number' && typeof right === 'number') {
          switch (expr.op) {
            case '+':
              return left + right;
            case '-':
              return left - right;
            case '*':
              return left * right;
            case '/':
              return left / right;
            case '%':
              return left % right;
            case '**':
              return left ** right;
            case '>':
              return left > right;
            case '<':
              return left < right;
            case '>=':
              return left >= right;
            case '<=':
              return left <= right;
            case '==':
              return left === right;
            case '!=':
              return left !== right;
          }
        }

        // Otherwise, serialize as expression string
        return `(${JSON.stringify(left)} ${expr.op} ${JSON.stringify(right)})`;
      }

      case 'UnaryExpression': {
        // Unary expression: !flag, -value
        const operand = yield* transformExpression(expr.operand, scope);

        switch (expr.op) {
          case '!':
            return !operand;
          case '-':
            if (typeof operand === 'number') {
              return -operand;
            }
            return `(-${JSON.stringify(operand)})`;
          default:
            return yield* Effect.fail({
              _tag: 'TransformError' as const,
              kind: 'InvalidExpression' as const,
              message: `Unknown unary operator: ${(expr as any).op}`,
              location: getSourceLocation(expr),
            });
        }
      }

      default:
        return yield* Effect.fail({
          _tag: 'TransformError' as const,
          kind: 'InvalidExpression' as const,
          message: `Unknown expression type: ${(expr as any).$type}`,
          location: getSourceLocation(expr),
        });
    }
  });
