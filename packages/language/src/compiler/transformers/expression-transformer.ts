/**
 * Expression transformation (Langium Expression → JsonValue).
 *
 * Extracted verbatim from `ast-transformer.ts` as part of the W2 decomposition
 * (CODE_ANALYSIS).
 */
import { Effect } from 'effect';
import type { TransformError } from '../../errors/index.js';
import { type Expression, isProgram, isVariableDeclaration } from '../../generated/ast.js';
import {
  isTimeConstant,
  TIME_VALUE_PLACEMENT_MESSAGE,
  timeConstantMisuseMessage,
} from '../../utils/time-constants.js';
import {
  evaluateExpression,
  resolveConstant,
  runtimeOperatorMessage,
} from '../expression-evaluator.js';
import {
  getConcatOperands,
  RUNTIME_CONCAT_CONTEXT_MESSAGE,
  RUNTIME_CONCAT_OPERAND_MESSAGE,
} from '../runtime-concat.js';
import type { ConstantMap } from '../types/constant-folding.js';
import type { JsonValue } from '../types/eligius-ir.js';
import { registerRuntimeConcat } from './runtime-values.js';
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

        // Idea #10: a time constant has no runtime value
        if (isVariableDeclaration(expr.variable.ref) && isTimeConstant(expr.variable.ref)) {
          return yield* Effect.fail({
            _tag: 'TransformError' as const,
            kind: 'InvalidExpression' as const,
            message: timeConstantMisuseMessage(varName),
            location: getSourceLocation(expr),
          });
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
        // Runtime string concatenation: "#" + slideId (runtime-concat.ts).
        // Constant concatenations ("a" + "b", "v" + @VERSION) still fold below.
        const concatOperands = getConcatOperands(expr);
        if (concatOperands && !evaluateExpression(expr, constantsInScope(scope)).canEvaluate) {
          return yield* transformRuntimeConcat(expr, concatOperands, scope);
        }
        // Binary expression: 10 + 5
        // Transform the operands first so their own errors (unresolved
        // references, runtime negation, ...) surface at the innermost node.
        yield* transformExpression(expr.left, scope);
        yield* transformExpression(expr.right, scope);
        // Only compile-time constants can be emitted: Eligius resolves a
        // property chain only as a whole string, so an expression over a
        // runtime value has no JSON form (if conditions are serialized by
        // condition-transformer.ts instead).
        return yield* foldConstantOperation(expr, expr.op, false, scope);
      }

      case 'UnaryExpression': {
        // Unary expression: !flag, -value
        yield* transformExpression(expr.operand, scope);

        switch (expr.op) {
          case '!': {
            // Fold only compile-time constants. The transformed operand cannot
            // tell us that: a runtime reference becomes a non-empty
            // property-chain string ('$operationdata.flag'), and JS `!` on it is
            // always `false`. Ask the constant evaluator instead, which resolves
            // literals and constant references by their actual declaration.
            const folded = evaluateExpression(expr.operand, constantsInScope(scope));
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
            return yield* foldConstantOperation(expr, expr.op, true, scope);
          default:
            return yield* Effect.fail({
              _tag: 'TransformError' as const,
              kind: 'InvalidExpression' as const,
              message: `Unknown unary operator: ${(expr as any).op}`,
              location: getSourceLocation(expr),
            });
        }
      }

      case 'TimeValue':
        // Idea #10: `7s` only means something as a time constant's value
        return yield* Effect.fail({
          _tag: 'TransformError' as const,
          kind: 'InvalidExpression' as const,
          message: TIME_VALUE_PLACEMENT_MESSAGE,
          location: getSourceLocation(expr),
        });

      default:
        return yield* Effect.fail({
          _tag: 'TransformError' as const,
          kind: 'InvalidExpression' as const,
          message: `Unknown expression type: ${(expr as any).$type}`,
          location: getSourceLocation(expr),
        });
    }
  });

/**
 * Transform a runtime string concatenation into a placeholder for its result.
 *
 * Each operand is transformed on its own, so a non-string operation inside the
 * chain (`"a" + (x * 2)`) reports its own error. Constant operands become
 * strings at compile time with JavaScript's `+` semantics; runtime operands stay
 * property chains for `concatenateStrings` to join (a runtime null/undefined
 * becomes an empty string there, as in Array.join).
 */
const transformRuntimeConcat = (
  expr: Expression,
  operands: readonly Expression[],
  scope: ScopeContext
): Effect.Effect<JsonValue, TransformError> =>
  Effect.gen(function* () {
    const parts: JsonValue[] = [];
    let previousIsConstant = false;
    for (const operand of operands) {
      const value = yield* transformExpression(operand, scope);
      if (value !== null && typeof value === 'object') {
        return yield* Effect.fail({
          _tag: 'TransformError' as const,
          kind: 'InvalidExpression' as const,
          message: RUNTIME_CONCAT_OPERAND_MESSAGE,
          location: getSourceLocation(operand),
        });
      }
      const constant = evaluateExpression(operand, constantsInScope(scope));
      const part = constant.canEvaluate ? String(value) : value;
      // Merge adjacent constant parts: ["#", "item-"] → ["#item-"]
      if (constant.canEvaluate && previousIsConstant) {
        parts[parts.length - 1] = `${parts[parts.length - 1]}${part}`;
      } else {
        parts.push(part);
      }
      previousIsConstant = constant.canEvaluate;
    }

    if (!scope.runtimeConcats) {
      return yield* Effect.fail({
        _tag: 'TransformError' as const,
        kind: 'InvalidExpression' as const,
        message: RUNTIME_CONCAT_CONTEXT_MESSAGE,
        location: getSourceLocation(expr),
      });
    }
    return registerRuntimeConcat(scope.runtimeConcats, parts);
  });

/** Program and action-scoped constants visible to an expression (scoped ones win). */
const constantsInScope = (scope: ScopeContext): ConstantMap =>
  new Map([...scope.programConstants.entries(), ...scope.scopedConstants.entries()]);

/**
 * Fold an operator expression whose operands have already been transformed.
 *
 * The transformed operands cannot be used for this: a runtime reference
 * becomes a property-chain string ('$operationdata.x'), indistinguishable from
 * a string literal. The constant evaluator resolves literals and constant
 * references by their declaration, so it tells constants and runtime values
 * apart:
 * - constant: emit the folded value
 * - invalid constant (division/modulo by zero, wrong operand type, non-finite
 *   result): compile error, there is no value to emit
 * - runtime operand: compile error. Eligius resolves property chains only as
 *   whole strings, so `x + 10` cannot be emitted (it used to become the inert
 *   string '("$operationdata.x" + 10)').
 */
const foldConstantOperation = (
  expr: Expression,
  op: string,
  unary: boolean,
  scope: ScopeContext
): Effect.Effect<JsonValue, TransformError> => {
  const folded = evaluateExpression(expr, constantsInScope(scope));
  if (folded.canEvaluate) {
    return Effect.succeed(folded.value ?? null);
  }
  return Effect.fail({
    _tag: 'TransformError' as const,
    kind: 'InvalidExpression' as const,
    message: folded.error?.invalid
      ? (folded.error.reason ?? 'Invalid constant expression')
      : runtimeOperatorMessage(op, unary),
    location: getSourceLocation(expr),
  });
};
