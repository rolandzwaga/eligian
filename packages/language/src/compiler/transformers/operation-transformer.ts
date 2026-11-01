/**
 * Operation-statement and control-flow transformation.
 *
 * Extracted verbatim from `ast-transformer.ts` as part of the W2 decomposition
 * (CODE_ANALYSIS). This module groups the mutually-recursive operation cluster:
 * operation-call transformation, the operation-statement dispatcher, the control
 * flow constructs (if/for/break/continue), action-scoped variable declarations,
 * and operation-sequence dependency validation.
 */
import { Effect } from 'effect';
import { getController, isController } from '../../completion/metadata/controllers.generated.js';
import type { TransformError } from '../../errors/index.js';
import type {
  ActionDefinition,
  BreakStatement,
  ContinueStatement,
  ForStatement,
  IfStatement,
  NavigateStatement,
  OperationCall,
  OperationStatement,
  Program,
  VariableDeclaration,
} from '../../generated/ast.js';
import { getOperationCallName } from '../../utils/operation-call-utils.js';
import { constantValueType, evaluateExpression } from '../expression-evaluator.js';
import { findActionByName } from '../name-resolver.js';
import { getOperationSignature } from '../operations/index.js';
import { mapParameters } from '../operations/mapper.js';
import { validateOperation } from '../operations/validator.js';
import type { JsonValue, OperationConfigIR } from '../types/eligius-ir.js';
import { buildActionCallOperations } from './action-call-operations.js';
import { transformCondition } from './condition-transformer.js';
import { transformExpression } from './expression-transformer.js';
import {
  buildNavigateOperations,
  resolveNavPosition,
  syntheticNavActionName,
} from './navigate-operations.js';
import {
  createRuntimeConcatCollector,
  lowerNodeOperations,
  withRuntimeValueLowering,
} from './runtime-values.js';
import { createEmptyScope, type ScopeContext } from './scope.js';
import { getProgram, getSourceLocation } from './source-location.js';

/**
 * Transform OperationCall → OperationConfigIR
 *
 * Handles function-style operation calls with positional parameters:
 *   selectElement("#title")
 *   animate({ opacity: 1 }, 500, "ease")
 *   setData({ "$operationdata.name": $scope.currentItem })
 *
 * Per DSL_DESIGN_DECISIONS.md Q3: Flattens wrapper objects automatically.
 * Constitution VII: Generates UUID for operation ID
 */
export const transformOperationCall = (
  opCall: OperationCall,
  scope: ScopeContext = createEmptyScope()
): Effect.Effect<OperationConfigIR, TransformError> =>
  Effect.gen(function* () {
    const operationName = getOperationCallName(opCall);
    const args = opCall.args || [];

    // Feature 035 T011: Transform addController into getControllerInstance + addControllerToElement
    // This is handled in transformOperationStatement which can return multiple operations
    // Here we just validate that addController is not called directly (it should be caught by validation)
    if (operationName === 'addController') {
      return yield* Effect.fail({
        _tag: 'TransformError' as const,
        kind: 'ValidationError' as const,
        message:
          'addController is syntactic sugar and should be transformed by transformOperationStatement',
        location: getSourceLocation(opCall),
      });
    }

    // T218: Validate operation before transforming
    const validationResult = validateOperation(operationName, args.length);
    if (!validationResult.success) {
      // Collect all validation errors and fail with first error
      const firstError = validationResult.errors[0];
      return yield* Effect.fail({
        _tag: 'TransformError' as const,
        kind: 'ValidationError' as const,
        message: `${firstError.message}${firstError.hint ? `. ${firstError.hint}` : ''}`,
        location: getSourceLocation(opCall),
      });
    }

    // T223: Use parameter mapper to transform arguments to operationData
    const signature = getOperationSignature(operationName);
    if (!signature) {
      // This should never happen after validation, but handle defensively
      return yield* Effect.fail({
        _tag: 'TransformError' as const,
        kind: 'ValidationError' as const,
        message: `Unknown operation: ${operationName}`,
        location: getSourceLocation(opCall),
      });
    }

    // BUG-001 FIX (T322): Transform Expression arguments to JsonValue before mapping
    // This ensures reference expressions (@@varName, @varName, paramName) are properly
    // transformed to their string representations ($scope.*, $operationdata.*)
    const transformedArgs: JsonValue[] = [];
    for (const arg of args) {
      const value = yield* transformExpression(arg, scope);
      transformedArgs.push(value);
    }

    // Map positional arguments to named parameters using operation signature
    const mappingResult = mapParameters(signature, transformedArgs);
    if (!mappingResult.success) {
      // Mapping failed - return first error
      const firstError = mappingResult.errors[0];
      return yield* Effect.fail({
        _tag: 'TransformError' as const,
        kind: 'ValidationError' as const,
        message: `${firstError.message}${firstError.hint ? `. ${firstError.hint}` : ''}`,
        location: getSourceLocation(opCall),
      });
    }

    let operationData = mappingResult.operationData as Record<string, JsonValue>;

    // Inside action bodies, a parameter that forwards the action argument of the
    // same name ($operationdata.<key> for key <key>) is omitted from operationData:
    // Eligius already provides it via startAction's actionOperationData. An argument
    // forwarded under a different name (selectElement(target) → selector) must stay,
    // since the operation reads its own key.
    if (scope.inActionBody) {
      const filteredData: Record<string, JsonValue> = {};
      for (const [key, value] of Object.entries(operationData)) {
        if (value !== `$operationdata.${key}`) {
          filteredData[key] = value;
        }
      }
      operationData = filteredData;
    }

    return {
      // Constitution VII: UUID v4 for operation ID
      id: crypto.randomUUID(),
      systemName: operationName,
      operationData: Object.keys(operationData).length > 0 ? operationData : undefined,
      sourceLocation: getSourceLocation(opCall),
    };
  });

/**
 * Transform OperationStatement → OperationConfigIR[]
 *
 * Handles all operation statement types:
 * - OperationCall: Direct operation invocation
 * - IfStatement: Syntactic sugar for when/otherwise/endWhen
 * - ForStatement: Syntactic sugar for forEach/endForEach
 *
 * Returns an array because control flow statements expand into multiple operations.
 *
 * Constitution VII: Generates UUIDs for all generated operations
 * T177, T180: Implements control flow transformations
 * T230: Accepts scope context for reference resolution
 */
export const transformOperationStatement = (
  stmt: OperationStatement,
  scope: ScopeContext = createEmptyScope(),
  isEndOperation: boolean = false,
  program?: Program,
  allActions?: ActionDefinition[]
): Effect.Effect<OperationConfigIR[], TransformError> =>
  // Operation calls, action calls and action-level consts may hold runtime
  // concatenations and forwarded runtime values; see runtime-values.ts.
  stmt.$type === 'OperationCall' || stmt.$type === 'VariableDeclaration'
    ? withRuntimeValueLowering(stmt, scope, statementScope =>
        transformStatement(stmt, statementScope, isEndOperation, program, allActions)
      )
    : transformStatement(stmt, scope, isEndOperation, program, allActions);

const transformStatement = (
  stmt: OperationStatement,
  scope: ScopeContext,
  isEndOperation: boolean,
  program: Program | undefined,
  allActions: ActionDefinition[] | undefined
): Effect.Effect<OperationConfigIR[], TransformError> =>
  Effect.gen(function* () {
    switch (stmt.$type) {
      case 'OperationCall': {
        // Feature 035 T011: Transform addController calls
        // addController('LabelController', "nav.home") →
        //   getControllerInstance({ systemName: 'LabelController' })
        //   addControllerToElement({ translationKey: "nav.home" })
        const operationName = getOperationCallName(stmt);

        if (operationName === 'addController') {
          const args = stmt.args || [];

          // First argument must be controller name (string literal)
          if (args.length === 0 || args[0].$type !== 'StringLiteral') {
            return yield* Effect.fail({
              _tag: 'TransformError' as const,
              kind: 'ValidationError' as const,
              message: 'addController requires controller name as first argument (string literal)',
              location: getSourceLocation(stmt),
            });
          }

          const controllerName = args[0].value;

          // Validate controller exists
          if (!isController(controllerName)) {
            return yield* Effect.fail({
              _tag: 'TransformError' as const,
              kind: 'ValidationError' as const,
              message: `Unknown controller: '${controllerName}'`,
              location: getSourceLocation(stmt),
            });
          }

          const controller = getController(controllerName);
          if (!controller) {
            return yield* Effect.fail({
              _tag: 'TransformError' as const,
              kind: 'InvalidAction' as const,
              message: `Failed to get controller metadata for '${controllerName}'`,
              location: getSourceLocation(stmt),
            });
          }

          // Transform remaining arguments (args[1+]) to parameter object
          const paramArgs = args.slice(1);
          const parameterData: Record<string, JsonValue> = {};

          for (let i = 0; i < paramArgs.length; i++) {
            const param = controller.parameters[i];
            if (!param) {
              return yield* Effect.fail({
                _tag: 'TransformError' as const,
                kind: 'ValidationError' as const,
                message: `Too many parameters for controller '${controllerName}'`,
                location: getSourceLocation(stmt),
              });
            }

            const argValue = yield* transformExpression(paramArgs[i], scope);
            parameterData[param.name] = argValue;
          }

          // Generate two operations: getControllerInstance + addControllerToElement
          const operations: OperationConfigIR[] = [];

          // 1. getControllerInstance
          operations.push({
            id: crypto.randomUUID(),
            systemName: 'getControllerInstance',
            operationData: { systemName: controllerName },
            sourceLocation: getSourceLocation(stmt),
          });

          // 2. addControllerToElement
          operations.push({
            id: crypto.randomUUID(),
            systemName: 'addControllerToElement',
            operationData: parameterData,
            sourceLocation: getSourceLocation(stmt),
          });

          return operations;
        }

        // T058: US3 - Check if this is an action call (for control flow in timelines)
        // If allActions is provided, search there (includes imported actions)
        // Otherwise, if program is passed, use it; otherwise walk up container chain
        const actionDef = allActions
          ? findActionByName(operationName, allActions)
          : findActionByName(operationName, program ?? (yield* getProgram(stmt)));

        if (actionDef) {
          // This is an action call - expand to requestAction + startAction/endAction
          // If isEndOperation is true and action is endable, use endAction instead of startAction

          // Transform arguments to actionOperationData
          let actionOperationData: Record<string, JsonValue> | undefined;
          if (stmt.args && stmt.args.length > 0) {
            const parameters = actionDef.parameters || [];

            // Check argument count matches parameter count
            if (stmt.args.length !== parameters.length) {
              return yield* Effect.fail({
                _tag: 'TransformError' as const,
                kind: 'ValidationError' as const,
                message: `Action '${operationName}' expects ${parameters.length} argument(s) but got ${stmt.args.length}. Expected: ${parameters.map(p => p.name).join(', ')}`,
                location: getSourceLocation(stmt),
              });
            }

            actionOperationData = {};
            for (let i = 0; i < parameters.length; i++) {
              const paramName = parameters[i].name;
              const argValue = yield* transformExpression(stmt.args[i], scope);
              // Inside an action body, an argument that forwards the caller's
              // parameter of the same name is omitted: startAction merges the
              // caller's operation data into the called action's, so it already
              // has that value. (Passing the chain would overwrite it with the
              // literal '$operationdata.<name>' string.)
              if (scope.inActionBody && argValue === `$operationdata.${paramName}`) {
                continue;
              }
              actionOperationData[paramName] = argValue;
            }
          }

          // startAction or endAction (depending on context and action type)
          const isEndableAction = actionDef.$type === 'EndableActionDefinition';
          const actionOperation = isEndOperation && isEndableAction ? 'endAction' : 'startAction';

          return buildActionCallOperations(
            // Library helpers are emitted under library-qualified names
            scope.actionSystemNames?.get(operationName) ?? operationName,
            actionOperationData,
            getSourceLocation(stmt),
            actionOperation
          );
        }

        // Not an action - treat as normal operation
        const op = yield* transformOperationCall(stmt, scope);
        return [op];
      }

      case 'IfStatement':
        // If/else → when/otherwise/endWhen sequence
        return yield* transformIfStatement(stmt, scope, program, allActions, isEndOperation);

      case 'ForStatement':
        // For loop → forEach/endForEach sequence
        return yield* transformForStatement(stmt, scope, program, allActions, isEndOperation);

      case 'VariableDeclaration':
        // Action-scoped variable → setVariable operation
        return yield* transformVariableDeclaration(stmt, scope);

      case 'BreakStatement':
        // break → breakForEach operation
        return yield* transformBreakStatement(stmt, scope);

      case 'ContinueStatement':
        // continue → continueForEach operation
        return yield* transformContinueStatement(stmt, scope);

      case 'WithStatement': {
        // Idea #17: with <selector> { ops } → selectElement(<selector>) + ops.
        // A runtime selector (`"#" + id`) is lowered like an operation argument.
        const concats = createRuntimeConcatCollector();
        const selector = yield* transformExpression(stmt.selector, {
          ...scope,
          runtimeConcats: concats,
        });
        const select = lowerNodeOperations(stmt, concats, [
          {
            id: crypto.randomUUID(),
            systemName: 'selectElement',
            operationData: { selector },
            sourceLocation: getSourceLocation(stmt),
          },
        ]);
        const body: OperationConfigIR[] = [];
        for (const statement of stmt.body) {
          body.push(
            ...(yield* transformOperationStatement(
              statement,
              scope,
              isEndOperation,
              program,
              allActions
            ))
          );
        }
        return [...select, ...body];
      }

      case 'NavigateStatement': {
        // on click "#sel" navigate "Target" [at <time>] →
        //   selectElement + getControllerInstance + addControllerToElement.
        // The synthetic broadcast action it references is emitted centrally in
        // transformAST (one per distinct target+position); its name is derived
        // purely so both sites agree.
        const navStmt = stmt as NavigateStatement;
        const position = yield* resolveNavPosition(navStmt.position);
        const actionName = syntheticNavActionName(navStmt.target, position);
        return buildNavigateOperations(navStmt.selector, actionName, getSourceLocation(navStmt));
      }

      default:
        return yield* Effect.fail({
          _tag: 'TransformError' as const,
          kind: 'InvalidExpression' as const,
          message: `Unknown operation statement type: ${(stmt as any).$type}`,
          location: getSourceLocation(stmt),
        });
    }
  });

/**
 * Transform IfStatement → when/otherwise/endWhen operations (T177)
 *
 * Transforms:
 *   if (condition) {
 *     thenOps
 *   } else {
 *     elseOps
 *   }
 *
 * Into:
 *   when({ expression })
 *   [thenOps...]
 *   otherwise()
 *   [elseOps...]
 *   endWhen()
 *
 * The condition is serialized to the Eligius `when` expression string by
 * {@link transformCondition}. For if-without-else, otherwise() is omitted.
 *
 * `isEndOperation` is forwarded to both branches, so an endable action called
 * inside an `if` in an end block is ended (endAction) rather than restarted.
 */
export const transformIfStatement = (
  stmt: IfStatement,
  scope: ScopeContext = createEmptyScope(),
  program?: Program,
  allActions?: ActionDefinition[],
  isEndOperation: boolean = false
): Effect.Effect<OperationConfigIR[], TransformError> =>
  Effect.gen(function* () {
    const operations: OperationConfigIR[] = [];

    // Transform condition → Eligius when expression string
    const expression = yield* transformCondition(stmt.condition, scope);

    // 1. when({ expression })
    operations.push({
      id: crypto.randomUUID(),
      systemName: 'when',
      operationData: {
        expression,
      },
      sourceLocation: getSourceLocation(stmt),
    });

    // 2. Transform then operations (recursively handle nested control flow)
    // Create a new scope for the then block (constants don't leak to else)
    const thenScope: ScopeContext = {
      ...scope,
      scopedConstants: new Map(scope.scopedConstants), // Clone the map
    };
    for (const thenOp of stmt.thenOps) {
      const ops = yield* transformOperationStatement(
        thenOp,
        thenScope,
        isEndOperation,
        program,
        allActions
      );
      operations.push(...ops);
    }

    // 3. otherwise() and else operations (if present)
    if (stmt.elseOps.length > 0) {
      operations.push({
        id: crypto.randomUUID(),
        systemName: 'otherwise',
        operationData: {},
        sourceLocation: getSourceLocation(stmt),
      });

      // Create a new scope for the else block (separate from then block)
      const elseScope: ScopeContext = {
        ...scope,
        scopedConstants: new Map(scope.scopedConstants), // Clone the map
      };
      for (const elseOp of stmt.elseOps) {
        const ops = yield* transformOperationStatement(
          elseOp,
          elseScope,
          isEndOperation,
          program,
          allActions
        );
        operations.push(...ops);
      }
    }

    // 4. endWhen()
    operations.push({
      id: crypto.randomUUID(),
      systemName: 'endWhen',
      operationData: {},
      sourceLocation: getSourceLocation(stmt),
    });

    return operations;
  });

/**
 * Transform ForStatement → forEach/endForEach operations (T180)
 *
 * Transforms:
 *   for (item in collection) {
 *     body
 *   }
 *
 * Into:
 *   forEach(collection, "item")
 *   [body operations...]
 *   endForEach()
 *
 * The item variable name is passed to forEach so Eligius can set it in the operation data context.
 *
 * `isEndOperation` is forwarded to the loop body (see {@link transformIfStatement}).
 */
export const transformForStatement = (
  stmt: ForStatement,
  scope: ScopeContext = createEmptyScope(),
  program?: Program,
  allActions?: ActionDefinition[],
  isEndOperation: boolean = false
): Effect.Effect<OperationConfigIR[], TransformError> =>
  Effect.gen(function* () {
    const operations: OperationConfigIR[] = [];

    // Transform collection expression
    const collection = yield* transformExpression(stmt.collection, scope);

    // 1. forEach(collection, itemName)
    operations.push({
      id: crypto.randomUUID(),
      systemName: 'forEach',
      operationData: {
        collection,
        itemName: stmt.itemName,
      },
      sourceLocation: getSourceLocation(stmt),
    });

    // 2. Transform loop body (recursively handle nested control flow)
    // T232: Create loop scope with variable aliasing
    // Inside the loop, @@itemName resolves to @@currentItem
    // Also clone scopedConstants so loop-scoped constants don't leak out
    const loopScope: ScopeContext = {
      ...scope,
      loopVariableName: stmt.itemName, // e.g., "item" in for (item in items)
      scopedConstants: new Map(scope.scopedConstants), // Clone the map
    };

    for (const bodyOp of stmt.body) {
      const ops = yield* transformOperationStatement(
        bodyOp,
        loopScope,
        isEndOperation,
        program,
        allActions
      );
      operations.push(...ops);
    }

    // 3. endForEach()
    operations.push({
      id: crypto.randomUUID(),
      systemName: 'endForEach',
      operationData: {},
      sourceLocation: getSourceLocation(stmt),
    });

    return operations;
  });

/**
 * Transform BreakStatement → breakForEach operation
 *
 * Transforms:
 *   break
 *
 * Into:
 *   { systemName: 'breakForEach', operationData: {} }
 */
export const transformBreakStatement = (
  stmt: BreakStatement,
  _scope: ScopeContext = createEmptyScope()
): Effect.Effect<OperationConfigIR[], TransformError> =>
  Effect.succeed([
    {
      id: crypto.randomUUID(),
      systemName: 'breakForEach',
      operationData: {},
      sourceLocation: getSourceLocation(stmt),
    },
  ]);

/**
 * Transform ContinueStatement → continueForEach operation
 *
 * Transforms:
 *   continue
 *
 * Into:
 *   { systemName: 'continueForEach', operationData: {} }
 */
export const transformContinueStatement = (
  stmt: ContinueStatement,
  _scope: ScopeContext = createEmptyScope()
): Effect.Effect<OperationConfigIR[], TransformError> =>
  Effect.succeed([
    {
      id: crypto.randomUUID(),
      systemName: 'continueForEach',
      operationData: {},
      sourceLocation: getSourceLocation(stmt),
    },
  ]);

/**
 * Transform VariableDeclaration → setVariable operation (T184)
 *
 * Transforms:
 *   const duration = 500
 *
 * Into:
 *   setVariable("duration", 500)
 *
 * This creates an action-scoped variable that can be referenced with @varName.
 */
export const transformVariableDeclaration = (
  stmt: VariableDeclaration,
  scope: ScopeContext = createEmptyScope()
): Effect.Effect<OperationConfigIR[], TransformError> =>
  Effect.gen(function* () {
    // ACTION-SCOPED CONSTANT FOLDING: Try to evaluate at compile time
    // Build a combined constant map: global constants + action-scoped constants
    const combinedConstants = new Map([
      ...scope.programConstants.entries(),
      ...scope.scopedConstants.entries(),
    ]);

    const evalResult = evaluateExpression(stmt.value, combinedConstants);

    if (evalResult.canEvaluate) {
      // This is a constant that can be inlined!
      // Add it to the scope's constant map for later references
      scope.scopedConstants.set(stmt.name, {
        name: stmt.name,
        value: evalResult.value!,
        type: constantValueType(evalResult.value!),
        declaration: stmt,
        sourceLocation: {
          line: stmt.$cstNode?.range.start.line ?? 0,
          column: stmt.$cstNode?.range.start.character ?? 0,
          file: stmt.$document?.uri.fsPath ?? 'unknown',
        },
      });

      // Don't generate setVariable operation - constant will be inlined
      return [];
    }

    // Cannot evaluate - treat as regular variable
    // Transform the value expression normally
    const value = yield* transformExpression(stmt.value, scope);

    // Create setVariable operation
    const operation: OperationConfigIR = {
      id: crypto.randomUUID(),
      systemName: 'setVariable',
      operationData: {
        name: stmt.name,
        value,
      },
      sourceLocation: getSourceLocation(stmt),
    };

    return [operation];
  });
