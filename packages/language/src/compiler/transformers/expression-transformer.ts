/**
 * Expression transformation (Langium Expression → JsonValue).
 *
 * Extracted verbatim from `ast-transformer.ts` as part of the W2 decomposition
 * (CODE_ANALYSIS).
 */
import { Effect } from 'effect';
import type { TransformError } from '../../errors/index.js';
import { type Expression, isProgram } from '../../generated/ast.js';
import { evaluateExpression, resolveConstant } from '../expression-evaluator.js';
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
        // The grammar consumes the '$' separately, so restore it: Eligius only
        // resolves chains starting with $operationdata., $globaldata. or $scope.
        const scope = expr.scope;
        const properties = expr.properties.join('.');
        return `$${scope}.${properties}`;
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

        // Inline a constant only if it is the declaration this reference links
        // to: action-scoped constants first (more specific scope), then global
        // ones. A non-foldable local that shadows a global const of the same
        // name is not in either map under its own declaration, so it falls
        // through to a runtime variable instead of inlining the global's value.
        const constant = resolveConstant(expr, scope.scopedConstants, scope.programConstants);
        if (constant) {
          return constant.value;
        }

        // Program-level variables are stored in global data (see the setData
        // init action in ast-transformer.ts)
        if (isProgram(expr.variable.ref.$container)) {
          return `$globaldata.${varName}`;
        }

        // Otherwise, it's a runtime scope variable
        return `$scope.variables.${varName}`;
      }

      case 'SystemPropertyReference': {
        // System property reference: @@varName (T232)
        // Compiles to $scope.varName, with optional property access:
        //   @@currentItem.label → $scope.currentItem.label
        // Special case: @@loopVar → @@currentItem (aliased)
        let propertyName = expr.name;

        // If this matches the current loop variable name, alias to currentItem
        if (scope.loopVariableName && expr.name === scope.loopVariableName) {
          propertyName = 'currentItem';
        }

        const suffix = expr.properties?.length ? `.${expr.properties.join('.')}` : '';
        return `$scope.${propertyName}${suffix}`;
      }

      case 'ParameterReference': {
        // Parameter reference: bare identifier (T231)
        // Compiles to $operationdata.paramName OR $operationData.eventArgs.n (Feature 028 - T020)
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
          // Dot-index, NOT bracket: eligius resolves property chains by splitting
          // on '.' and doing plain key access (get-property-chain-value.ts) — it
          // has no bracket parsing, so `eventArgs[0]` looks up the literal key
          // "eventArgs[0]" (undefined). `eventArgs.0` resolves the array element
          // (arrays index by string key). Verified in-engine via the tour's
          // Chapter-5 `on event` round-trip.
          return `$operationData.eventArgs.${index}`;
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
          case '!': {
            // Fold only compile-time constants. The transformed operand cannot
            // tell us that: a runtime reference becomes a non-empty
            // property-chain string ('$operationdata.flag'), and JS `!` on it is
            // always `false`. Ask the constant evaluator instead, which resolves
            // literals and constant references by their actual declaration.
            const folded = evaluateExpression(
              expr.operand,
              new Map([...scope.programConstants.entries(), ...scope.scopedConstants.entries()])
            );
            if (folded.canEvaluate) {
              return !folded.value;
            }
            // Eligius has no runtime negation outside conditions, so emitting
            // anything here would be silently wrong.
            return yield* Effect.fail({
              _tag: 'TransformError' as const,
              kind: 'InvalidExpression' as const,
              message:
                'Negation of runtime values (parameters, variables, system properties) is only supported inside if/when conditions',
              location: getSourceLocation(expr),
            });
          }
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
